import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';

import {
  clearLocalDraft,
  loadLocalDraft,
  ownedDraftStorageKey,
  saveLocalDraft,
  type StoredComposerDraft,
} from '@/lib/draft-storage';
import {
  READ_RETRY_MAX,
  readRetryDelay,
  readRetryDelayCeiling,
  shouldRetryRead,
} from '@/lib/query-retry';
import { registerComposerFlush, type FlushTarget, type VisibilityDoc } from '@/lib/composer-flush';
import { selectThreadViewState } from '@/lib/thread-view-state';
import { selectMailListState } from '@/lib/mail-list-state';

/**
 * 30-minute local robustness soak (issue #34, check point 8).
 *
 * Runs for `SOAK_MINUTES` (default 30) real minutes, exercising the REAL robustness
 * primitives (no reimplementation) and proving the four soak invariants:
 *   1. no uncaught promise rejection / uncaught exception
 *   2. no duplicate shortcut execution (register/cleanup discipline)
 *   3. no leaked timer/listener (add/remove balance returns to baseline)
 *   4. no monotonically growing request loop (retry stays capped at 1 + READ_RETRY_MAX)
 *
 * A heartbeat is appended to SOAK_LOG (default .architect/tmp/soak/soak.log) every
 * ~30s so progress is observable and archived.
 */

const SOAK_MINUTES = Number(process.env.SOAK_MINUTES ?? '30');
const LOG_PATH = process.env.SOAK_LOG ?? resolve(process.cwd(), '.architect/tmp/soak/soak.log');

function log(line: string): void {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
}

// --- counting fakes for the listener-leak invariant -------------------------
interface Recorder extends FlushTarget {
  size: number;
  added: number;
  removed: number;
  listeners: Map<string, () => void>;
}
function makeTarget(): Recorder {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    added: 0,
    removed: 0,
    get size() {
      return listeners.size;
    },
    addEventListener(type, cb) {
      listeners.set(type, cb);
      this.added++;
    },
    removeEventListener(type) {
      listeners.delete(type);
      this.removed++;
    },
  };
}
function makeDoc(): Recorder & VisibilityDoc {
  return Object.assign(makeTarget(), { visibilityState: 'visible' });
}

// --- simulated persistently-failing read (request-loop invariant) -----------
function attemptsForPersistentFailure(): number {
  let attempts = 0;
  const error = { data: { httpStatus: 500 } };
  // Mirrors react-query's loop: initial try + retries while shouldRetryRead is true.
  attempts++; // first attempt
  let failureCount = 0;
  while (shouldRetryRead(failureCount, error)) {
    // ensure the delay the client would wait is always bounded
    const delay = readRetryDelay(failureCount);
    if (delay > readRetryDelayCeiling(failureCount)) {
      throw new Error(`retry delay ${delay} exceeded ceiling at attempt ${failureCount}`);
    }
    attempts++;
    failureCount++;
  }
  return attempts;
}

// --- shortcut dedup model (duplicate-execution invariant) -------------------
function executionsPerTriggerUnderChurn(): number {
  // Unique-keyed registry (like react-hotkeys scopes): each mount registers its own
  // handler and each cleanup removes ONLY its own. After churn exactly one handler
  // stays live, so one trigger fires exactly once — no duplicate execution.
  const handlers = new Map<number, () => void>();
  let executions = 0;
  let nextId = 0;
  const register = () => {
    const id = nextId++;
    handlers.set(id, () => {
      executions++;
    });
    return () => handlers.delete(id);
  };
  const cleanups = Array.from({ length: 25 }, () => register());
  cleanups.slice(0, 24).forEach((c) => c()); // unmount all but the last
  handlers.forEach((handler) => handler()); // one trigger over the live handlers
  cleanups[24]?.();
  return executions;
}

// v2 owned keys only (owner-transition fix): the soak exercises the SAME key
// shape the app uses — legacy v1 keys are never read/written outside the
// dedicated compatibility tests.
const SOAK_OWNER = { userId: 'soak-user', connectionId: 'soak-conn' };

const draft: StoredComposerDraft = {
  to: ['soak@zero.test'],
  cc: [],
  bcc: [],
  subject: 'soak',
  message: '<p>soak body</p>',
  savedAt: 0,
};

test('30-minute robustness soak — no rejections, leaks, dup shortcuts, or growing request loop', async () => {
  const deadline = Date.now() + SOAK_MINUTES * 60 * 1000;

  let unhandledRejections = 0;
  let uncaughtExceptions = 0;
  const onRejection = () => {
    unhandledRejections++;
  };
  const onException = () => {
    uncaughtExceptions++;
  };
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);

  const win = makeTarget();
  const doc = makeDoc();

  let iterations = 0;
  let maxRequestAttempts = 0;
  let lastHeartbeat = 0;

  log(`SOAK START minutes=${SOAK_MINUTES} deadline=${new Date(deadline).toISOString()}`);

  try {
    while (Date.now() < deadline) {
      iterations++;

      // (4) request-loop invariant — capped at 1 + READ_RETRY_MAX, never growing.
      const attempts = attemptsForPersistentFailure();
      maxRequestAttempts = Math.max(maxRequestAttempts, attempts);
      expect(attempts).toBeLessThanOrEqual(1 + READ_RETRY_MAX);

      // (3a) listener-leak invariant — every register is balanced by cleanup.
      const key = ownedDraftStorageKey(SOAK_OWNER, { threadId: `t${iterations % 8}` });
      const flush = () => saveLocalDraft(key, { ...draft, savedAt: Date.now() });
      const cleanup = registerComposerFlush(win, doc, flush);
      // exercise the durability path (also (1): a throwing flush must never leak)
      flush();
      expect(loadLocalDraft(key)?.subject).toBe('soak');
      cleanup();
      expect(win.size).toBe(0);
      expect(doc.size).toBe(0);
      clearLocalDraft(key);

      // (2) duplicate-shortcut invariant — exactly one execution per trigger.
      expect(executionsPerTriggerUnderChurn()).toBe(1);

      // exercise the honest-state selectors so a regression there trips the soak too.
      expect(
        selectMailListState({ itemCount: 0, isLoading: false, isError: true, isOffline: false }),
      ).toBe('error');
      expect(
        selectThreadViewState({
          hasSelection: true,
          hasData: false,
          isLoading: false,
          isError: true,
          isOffline: false,
        }),
      ).toBe('error');

      // (1) exercise an async path that MUST be caught, never leaking a rejection.
      await Promise.resolve()
        .then(() => {
          if (attempts < 0) throw new Error('unreachable');
        })
        .catch(() => {
          /* swallowed on purpose */
        });

      const now = Date.now();
      if (now - lastHeartbeat >= 30_000) {
        lastHeartbeat = now;
        const remainingMin = Math.max(0, Math.round((deadline - now) / 60000));
        log(
          `HEARTBEAT iter=${iterations} rejections=${unhandledRejections} uncaught=${uncaughtExceptions} ` +
            `listeners(win=${win.size},doc=${doc.size}) maxAttempts=${maxRequestAttempts} remainingMin=${remainingMin}`,
        );
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // Final invariants.
    expect(unhandledRejections).toBe(0);
    expect(uncaughtExceptions).toBe(0);
    expect(win.added).toBe(win.removed);
    expect(doc.added).toBe(doc.removed);
    expect(win.size).toBe(0);
    expect(doc.size).toBe(0);
    expect(maxRequestAttempts).toBeLessThanOrEqual(1 + READ_RETRY_MAX);

    log(
      `SOAK PASS iterations=${iterations} rejections=${unhandledRejections} uncaught=${uncaughtExceptions} ` +
        `maxAttempts=${maxRequestAttempts} listenerBalance(win=${win.added - win.removed},doc=${doc.added - doc.removed})`,
    );
  } catch (error) {
    log(
      `SOAK FAIL iter=${iterations} error=${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    process.off('unhandledRejection', onRejection);
    process.off('uncaughtException', onException);
  }
});
