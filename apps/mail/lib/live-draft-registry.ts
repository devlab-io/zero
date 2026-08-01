/**
 * LIVE draft registry (slice 2bis, spec docs/spec/mail-copilot.md).
 *
 * STRICT in-memory seam — no localStorage, no IndexedDB, no network. The
 * mounted EmailComposer publishes its CURRENT content here on every relevant
 * form change and editor update; Ask Reta reads it ONCE at submit time so the
 * context can never lag behind what was just typed (the durable local
 * autosave may be behind — this seam is the truth of the moment).
 *
 * Keys are the EXACT composer persistence scope (lib/draft-storage
 * draftStorageKey): account/thread/draft/reply isolation is structural.
 * Owner generations make cleanup non-destructive: a stale unmount can never
 * remove the entry of a NEWER composer instance on the same scope.
 *
 * Snapshots are bounded (recipients, subject, body) and carry NO binary
 * attachment data — publishing is clamp-on-write, reading returns the clamped
 * copy only.
 */

export type LiveDraftSnapshot = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  revision: number;
  savedAt: number;
};

export type LiveDraftPublishInput = {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  bodyHtml?: unknown;
};

const LIMITS = {
  recipients: 20,
  recipientChars: 200,
  subjectChars: 500,
  bodyChars: 120_000,
} as const;

type Entry = {
  generation: number;
  snapshot: LiveDraftSnapshot | null;
};

const registry = new Map<string, Entry>();
let generationCounter = 0;

const clampRecipients = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, LIMITS.recipients)
        .map((item) => item.slice(0, LIMITS.recipientChars))
    : [];

const clampString = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/**
 * Register a live composer for a scope. The returned handle OWNS the entry
 * until a newer registration supersedes it: superseded handles publish and
 * unregister as no-ops (non-destructive cleanup).
 */
export function registerLiveDraft(scopeKey: string): {
  publish: (input: LiveDraftPublishInput) => void;
  unregister: () => void;
} {
  generationCounter += 1;
  const generation = generationCounter;
  const entry: Entry = { generation, snapshot: null };
  registry.set(scopeKey, entry);

  const owns = () => registry.get(scopeKey)?.generation === generation;

  return {
    publish: (input) => {
      const current = registry.get(scopeKey);
      if (!current || current.generation !== generation) return; // superseded
      current.snapshot = {
        to: clampRecipients(input.to),
        cc: clampRecipients(input.cc),
        bcc: clampRecipients(input.bcc),
        subject: clampString(input.subject, LIMITS.subjectChars),
        bodyHtml: clampString(input.bodyHtml, LIMITS.bodyChars),
        revision: (current.snapshot?.revision ?? 0) + 1,
        savedAt: Date.now(),
      };
    },
    unregister: () => {
      if (owns()) registry.delete(scopeKey);
    },
  };
}

/** True when a live composer is currently registered for this exact scope. */
export function hasLiveComposer(scopeKey: string): boolean {
  return registry.has(scopeKey);
}

/**
 * The current live snapshot, or null (registered but nothing published yet).
 * Returns a DEEP COPY: a caller mutating the result can never alter the store.
 */
export function readLiveDraft(scopeKey: string): LiveDraftSnapshot | null {
  const snapshot = registry.get(scopeKey)?.snapshot;
  if (!snapshot) return null;
  return {
    ...snapshot,
    to: [...snapshot.to],
    cc: [...snapshot.cc],
    bcc: [...snapshot.bcc],
  };
}
