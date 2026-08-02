import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Contrat source du store des brouillons collaboratifs (P15) — les invariants
// SQL/ACL non exécutables sans Postgres sont verrouillés sur le texte du
// module ; la logique pure (digest, détection collision) est testée réellement
// dans team-drafts-shared.test.ts.
const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'team-drafts-store.ts'),
  'utf8',
);
const realtimeSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../routes/team-realtime.ts'),
  'utf8',
);
const mailRouteSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../trpc/routes/mail.ts'),
  'utf8',
);

describe('team drafts contract — ownership & exposure', () => {
  it('the draft is read through the SHARER connection resolved server-side, never a client connectionId', () => {
    expect(source).toContain('thread.sharerConnectionId');
    expect(source).not.toContain('input.connectionId');
  });

  it('only the sharer requests a review; the reviewer must pass the thread ACL; no self-review', () => {
    const block = source.slice(
      source.indexOf('export async function requestReview'),
      source.indexOf('export async function getReviewForThread'),
    );
    expect(block).toContain(
      "if (thread.sharerUserId !== userId) throw new TeamStoreError('not_draft_owner')",
    );
    expect(block).toContain(
      "if (input.reviewerUserId === userId) throw new TeamStoreError('not_reviewer')",
    );
    expect(block).toContain('getTeamThread(db, input.reviewerUserId, input.teamThreadId)');
  });

  it('draftId never crosses to the client and suggestion bodies are party-only', () => {
    const block = source.slice(
      source.indexOf('export async function getReviewForThread'),
      source.indexOf('export async function readReviewDraft'),
    );
    expect(block).toContain('isParty');
    expect(block).toContain('draftId reste serveur');
    expect(block).not.toContain('draftId: teamDraftReview.draftId');
  });

  it('the reviewer NEVER mutates the owner Gmail: the only injected effect is getDraft (read)', () => {
    expect(source).toContain('DraftReadEffects');
    expect(source).not.toContain('putDraft');
    expect(source).not.toContain('updateDraft');
    expect(source).not.toContain('createDraft');
  });
});

describe('team drafts contract — freshness (digest + revision)', () => {
  it('suggestion and decision re-read the REAL draft and refuse both stale forms', () => {
    const block = source.slice(source.indexOf('async function requireFreshDraft'));
    expect(block).toContain('digest !== review.draftDigest || digest !== baseDigest');
    expect(source).toContain("throw new TeamStoreError('draft_stale')");
    for (const fn of ['suggestEdit', 'setReviewDecision']) {
      const fnBlock = source.slice(
        source.indexOf(`export async function ${fn}`),
        source.indexOf('export async function', source.indexOf(`export async function ${fn}`) + 10),
      );
      expect(fnBlock, fn).toContain('requireFreshDraft');
    }
  });

  it('revision is monotonic on every transition and rebase is owner-only with a fresh digest', () => {
    expect(source).toContain('revision: review.revision + 1');
    const rebaseBlock = source.slice(
      source.indexOf('export async function rebaseReview'),
      source.indexOf('export async function markSuggestionApplied'),
    );
    expect(rebaseBlock).toContain('not_draft_owner');
    expect(rebaseBlock).toContain('readOwnerDraft');
  });

  it('one ACTIVE review per (thread, draft): partial-unique insert, no-return = review_exists', () => {
    expect(source).toContain('.onConflictDoNothing()');
    expect(source).toContain("throw new TeamStoreError('review_exists')");
  });

  it('every lifecycle transition audits and notifies', () => {
    for (const action of [
      'draft.review_requested',
      'draft.suggested',
      'draft.approved',
      'draft.changes_requested',
      'draft.review_rebased',
      'draft.suggestion_applied',
      'draft.review_cancelled',
      'draft.review_completed',
    ]) {
      expect(source, action).toContain(action);
    }
    expect(source).toContain('notifyDraftReview');
  });
});

describe('team reply claim contract — atomic anti double-send', () => {
  it('claims via partial-unique insert; same user + same submission key is idempotent, anyone else refused', () => {
    const block = source.slice(source.indexOf('export async function claimTeamReply'));
    expect(block).toContain('.onConflictDoNothing()');
    expect(block).toContain('active.userId === userId');
    expect(block).toContain('active.clientSubmissionKey === input.clientSubmissionKey');
    expect(block).toContain("throw new TeamStoreError('reply_claimed')");
  });

  it('preflight reads member emails + claims and NEVER receives message bodies', () => {
    const block = source.slice(source.indexOf('export async function sendCollisionPreflight'));
    expect(block).toContain('detectInboundMemberReplies');
    expect(block).toContain('senderEmail: string; receivedOnMs: number | null');
    expect(block).not.toContain('body');
  });
});

describe('realtime replying contract — no content, always closed on revocation', () => {
  it('replying state is PER SOCKET (durci) — one tab closing never cuts another; kick/closeAll purge', () => {
    // Le comportement complet est prouvé par team-realtime.replying.test.ts
    // (DO instancié) ; ici on verrouille la structure par-socket.
    expect(realtimeSource).toContain('private replyingBySocket = new Map<string,');
    const closeBlock = realtimeSource.slice(realtimeSource.indexOf('webSocketClose'));
    expect(closeBlock).toContain('this.replyingBySocket.delete(attachment.socketId)');
    const closeAllBlock = realtimeSource.slice(realtimeSource.indexOf('async closeAll'));
    expect(closeAllBlock).toContain('this.replyingBySocket.clear()');
  });

  it('the presence payload carries only timestamps — never draft or body content', () => {
    expect(realtimeSource).toContain('replyingUntil: number | null');
    expect(realtimeSource).toContain('REPLYING_TTL_MS');
    const presenceBlock = realtimeSource.slice(
      realtimeSource.indexOf('presenceSnapshot()'),
      realtimeSource.indexOf('private broadcastPresence'),
    );
    expect(presenceBlock).not.toMatch(/bodyText|draft|content|subject/);
  });
});

describe('mail.send collision contract — never auto-send, idempotence preserved', () => {
  it('preflight + claim run BEFORE createSendJob; a collision returns without any job', () => {
    const preflightAt = mailRouteSource.indexOf('teamSendCollisionPreflight');
    const claimAt = mailRouteSource.indexOf('claimTeamReply', preflightAt);
    // L'APPEL createSendJob(db (pas l'import en tête de fichier).
    const createJobAt = mailRouteSource.indexOf('createSendJob(db', claimAt);
    expect(preflightAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(preflightAt);
    expect(createJobAt).toBeGreaterThan(claimAt);
    expect(mailRouteSource).toContain('overrideCollision === true');
    expect(mailRouteSource).toContain("error: 'collision'");
  });

  it('the claim resolves to the HONEST outcome accepted (never « sent »/« enqueued ») or released, with explicit failure states', () => {
    expect(mailRouteSource).toContain("resolveTeamReplyClaim(teamClaimId, 'accepted')");
    expect(mailRouteSource).toContain("resolveTeamReplyClaim(teamClaimId, 'released')");
    expect(mailRouteSource).not.toContain("resolveTeamReplyClaim(teamClaimId, 'sent')");
    expect(mailRouteSource).not.toContain("resolveTeamReplyClaim(teamClaimId, 'enqueued')");
    expect(mailRouteSource).toContain('markTeamThreadReviewsCompleted');
    // Un échec de résolution n'est jamais avalé : loggé + état explicite.
    expect(mailRouteSource).toContain('teamClaimResolution');
    expect(mailRouteSource).toContain('claim left ACTIVE (visible)');
  });

  it('the preflight reads the SHARER mailbox resolved server-side, thread must match, fail closed', () => {
    expect(mailRouteSource).toContain('getThread(share.sharerConnectionId, share.threadId)');
    expect(mailRouteSource).toContain('share.threadId !== input.threadId');
    expect(mailRouteSource).toContain('collision_preflight_unavailable');
    // Le claim est GARANTI libéré sur exception avant acceptation durable.
    expect(mailRouteSource).toContain('team reply claim release failed after send exception');
  });

  it('the collision baseline is a SERVER reply intent — no client timestamp field exists at all', () => {
    // Le champ client a été RETIRÉ du contrat : aucune forge possible.
    expect(mailRouteSource).not.toContain('collisionBaseline');
    expect(mailRouteSource).toContain('getValidTeamReplyIntent');
    expect(mailRouteSource).toContain('baselineMs = intent.baselineAtMs');
    expect(mailRouteSource).toContain("error: 'reply_intent_invalid'");
    // clientSendId + replyIntentId sont OBLIGATOIRES avec teamThreadId (schéma).
    expect(mailRouteSource).toContain('clientSendId is required for team-linked sends');
    expect(mailRouteSource).toContain('replyIntentId is required for team-linked sends');
    // Override ONE-SHOT armé serveur : consommé AVANT de marquer la collision
    // courante — la collision de l'instant ne peut pas armer son propre override.
    const consumeAt = mailRouteSource.indexOf('consumeTeamReplyIntentOverride');
    const markAt = mailRouteSource.indexOf('markTeamReplyIntentCollision');
    expect(consumeAt).toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(consumeAt);
    // Retry idempotent : le claim déjà détenu bypasse intent + préflight.
    expect(mailRouteSource).toContain('findOwnTeamReplyClaim');
  });

  it('the existing sendStoredDraft direct path and submission-key idempotence are untouched', () => {
    expect(mailRouteSource).toContain('sendAsStored');
    expect(mailRouteSource).toContain('clientSubmissionKey: clientSendId ?? crypto.randomUUID()');
  });
});
