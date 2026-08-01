/**
 * Ask Reta conversation persistence (slice 2) — privacy-first by design:
 * DEVICE-LOCAL only (localStorage), nothing server-side. Scoped to
 * user + active connection so an A→B→A account switch never leaks a turn
 * across mailboxes. Bounded retention and turn cap; clear() is effective.
 *
 * STRICT VERSIONED PROJECTION (revue 2026-08-01): what is persisted is NOT
 * the in-memory turn. The `proposal` (raw draft HTML) is DROPPED entirely —
 * no draft/body content ever lands in storage, and no draft action can
 * reappear after a reload. localStorage is tamperable: every string/array is
 * bounded and the whole payload (citations/steps/search threads) is deeply
 * validated on load; anything off-contract is discarded, unknown keys are
 * stripped. Bounded verified quotes + metadata are the only content kept.
 */

import type { AskRetaTurn } from '@/components/copilot/ask-reta-state';
import { z } from 'zod';

const KEY_PREFIX = 'zero:ask-reta:conv:';
export const ASK_RETA_CONVERSATION_CAP = 40;
export const ASK_RETA_CONVERSATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_VERSION = 2 as const;
const MAX_RAW_CHARS = 200_000;
const MAX_CONTENT_CHARS = 6_000;

export const askRetaConversationKey = (userId: string, connectionId: string) =>
  `${KEY_PREFIX}${userId}:${connectionId}`;

const bounded = (max: number) => z.string().max(max);

const persistedCitationSchema = z.object({
  ref: bounded(16),
  kind: z.literal('message'),
  threadId: bounded(200),
  messageId: bounded(200).optional(),
  subject: bounded(300),
  sender: bounded(300),
  date: bounded(64),
  excerptHash: z.string().regex(/^[0-9a-f]{64}$/),
  quote: bounded(300),
});

const persistedStepThreadSchema = z.object({
  threadId: bounded(200),
  subject: bounded(300),
  sender: bounded(300),
  date: bounded(64),
});

const persistedStepSchema = z.object({
  id: bounded(64),
  kind: z.enum(['overview', 'search', 'read_thread']),
  detail: bounded(300),
  sourceRefs: z.array(bounded(16)).max(48),
  search: z
    .object({
      query: bounded(300),
      folder: bounded(40).optional(),
      threads: z.array(persistedStepThreadSchema).max(10),
    })
    .optional(),
});

// NO `proposal` field, by contract — a tampered store cannot resurrect one
// because unknown keys are stripped and the type has no slot for it.
const persistedPayloadSchema = z.object({
  citations: z.array(persistedCitationSchema).max(12),
  steps: z.array(persistedStepSchema).max(12),
  model: bounded(40),
});

const persistedTurnSchema = z.object({
  id: bounded(64),
  role: z.enum(['user', 'assistant']),
  content: bounded(MAX_CONTENT_CHARS),
  payload: persistedPayloadSchema.optional(),
});

const storedConversationSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  savedAt: z.number().int().nonnegative(),
  turns: z.array(persistedTurnSchema).max(ASK_RETA_CONVERSATION_CAP),
});

type PersistedTurn = z.infer<typeof persistedTurnSchema>;

const getStore = (): Storage | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Projection: strips `proposal` (raw draft HTML) and clamps free text. */
const toPersistedTurn = (turn: AskRetaTurn): PersistedTurn => ({
  id: turn.id.slice(0, 64),
  role: turn.role,
  content: turn.content.slice(0, MAX_CONTENT_CHARS),
  ...(turn.payload
    ? {
        payload: {
          citations: turn.payload.citations.slice(0, 12),
          steps: turn.payload.steps.slice(0, 12).map((step) => ({
            id: step.id.slice(0, 64),
            kind: step.kind,
            detail: step.detail.slice(0, 300),
            sourceRefs: step.sourceRefs.slice(0, 48),
            ...(step.search
              ? {
                  search: {
                    query: step.search.query.slice(0, 300),
                    ...(step.search.folder ? { folder: step.search.folder.slice(0, 40) } : {}),
                    threads: step.search.threads.slice(0, 10),
                  },
                }
              : {}),
          })),
          model: turn.payload.model.slice(0, 40),
        },
      }
    : {}),
});

export function loadAskRetaConversation(userId: string, connectionId: string): AskRetaTurn[] {
  const store = getStore();
  if (!store || !userId || !connectionId) return [];
  const key = askRetaConversationKey(userId, connectionId);
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    // Oversize store = tampering or corruption: discard, never parse.
    if (raw.length > MAX_RAW_CHARS) {
      store.removeItem(key);
      return [];
    }
    const parsed = storedConversationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      store.removeItem(key);
      return [];
    }
    if (Date.now() - parsed.data.savedAt > ASK_RETA_CONVERSATION_RETENTION_MS) {
      store.removeItem(key);
      return [];
    }
    // zod strips unknown keys: a tampered `proposal` cannot come back.
    return parsed.data.turns.slice(-ASK_RETA_CONVERSATION_CAP);
  } catch {
    try {
      store.removeItem(key);
    } catch {
      /* best-effort */
    }
    return [];
  }
}

export function saveAskRetaConversation(
  userId: string,
  connectionId: string,
  turns: AskRetaTurn[],
): void {
  const store = getStore();
  if (!store || !userId || !connectionId) return;
  const key = askRetaConversationKey(userId, connectionId);
  try {
    if (turns.length === 0) {
      store.removeItem(key);
      return;
    }
    const candidate = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      turns: turns.slice(-ASK_RETA_CONVERSATION_CAP).map(toPersistedTurn),
    };
    // The projection must satisfy its own load contract; otherwise skip.
    const validated = storedConversationSchema.safeParse(candidate);
    if (!validated.success) return;
    const serialized = JSON.stringify(validated.data);
    if (serialized.length > MAX_RAW_CHARS) return;
    store.setItem(key, serialized);
  } catch {
    /* quota/private mode: persistence is best-effort */
  }
}

export function clearAskRetaConversation(userId: string, connectionId: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(askRetaConversationKey(userId, connectionId));
  } catch {
    /* best-effort */
  }
}
