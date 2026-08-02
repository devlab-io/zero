import {
  ACTIVE_REVIEW_STATES,
  computeDraftDigest,
  detectInboundMemberReplies,
  normalizeDraftSnapshot,
  type CollisionReason,
  type DraftReviewState,
  type DraftSnapshot,
} from './team-drafts-shared';
import {
  teamAuditLog,
  teamDraftReview,
  teamDraftSuggestion,
  teamMember,
  teamReplyClaim,
  teamReplyIntent,
  user,
} from '../../db/schema';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { getTeamThread, notifyDraftReview, TeamStoreError } from './team-store';
import type { DB } from '../../db';

/**
 * Brouillons collaboratifs (P15) — persistance et cycle de vie.
 *
 * Propriété : le brouillon Gmail APPARTIENT au partageur du fil. `draftId`
 * est scoped à teamThread.sharerConnectionId, résolu SERVEUR à chaque
 * lecture via l'effet injecté — jamais fourni avec un connectionId client,
 * jamais exposé au-delà du couple owner/reviewer. Le reviewer ne mute JAMAIS
 * le Gmail du propriétaire : il suggère (texte borné) et décide ; l'owner
 * seul applique, dans SON composeur, via l'autosave existant.
 *
 * Fraîcheur : chaque review porte `draftDigest` (condensé serveur au moment
 * de la demande/du rebase) et `revision` monotone. Toute suggestion ou
 * décision relit le brouillon RÉEL et refuse si le digest ne correspond plus
 * (stale) — au digest stocké comme au digest de base du client.
 *
 * Toutes les fonctions re-passent resolveAccess (via getTeamThread) — une
 * révocation d'ACL coupe immédiatement lecture ET écriture.
 */

export type DraftReadEffects = {
  /** Lecture AUTORITATIVE du brouillon du propriétaire — connexion résolue serveur. */
  getDraft: (
    connectionId: string,
    draftId: string,
  ) => Promise<{
    subject?: string | null;
    content?: string | null;
    to?: string[] | null;
    cc?: string[] | null;
    bcc?: string[] | null;
  } | null>;
};

const MAX_SUGGESTION_BODY = 100_000;
const MAX_SUGGESTION_NOTE = 2_000;
const MAX_SUGGESTIONS_LISTED = 50;

async function audit(
  db: DB,
  entry: {
    teamId: string;
    actorUserId: string;
    action: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(teamAuditLog).values({
    id: crypto.randomUUID(),
    teamId: entry.teamId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    subjectType: 'team_draft_review',
    subjectId: entry.subjectId,
    metadata: entry.metadata ?? {},
  });
}

async function requireReview(db: DB, reviewId: string) {
  const rows = await db
    .select()
    .from(teamDraftReview)
    .where(eq(teamDraftReview.id, reviewId))
    .limit(1);
  const review = rows[0];
  if (!review) throw new TeamStoreError('not_found');
  return review;
}

const isActive = (state: DraftReviewState) => ACTIVE_REVIEW_STATES.includes(state);

async function readOwnerDraft(
  db: DB,
  effects: DraftReadEffects,
  sharerConnectionId: string,
  draftId: string,
): Promise<{ snapshot: DraftSnapshot; digest: string }> {
  const draft = await effects.getDraft(sharerConnectionId, draftId);
  if (!draft) throw new TeamStoreError('not_found');
  const snapshot = normalizeDraftSnapshot(draft);
  return { snapshot, digest: await computeDraftDigest(snapshot) };
}

// --- cycle de vie -------------------------------------------------------------

export async function requestReview(
  db: DB,
  effects: DraftReadEffects,
  userId: string,
  input: { teamThreadId: string; draftId: string; reviewerUserId: string },
) {
  const thread = await getTeamThread(db, userId, input.teamThreadId);
  // Le brouillon appartient au PARTAGEUR — lui seul peut demander relecture.
  if (thread.sharerUserId !== userId) throw new TeamStoreError('not_draft_owner');
  if (input.reviewerUserId === userId) throw new TeamStoreError('not_reviewer');
  // Le reviewer doit passer la même ACL stricte que toute lecture du fil.
  try {
    await getTeamThread(db, input.reviewerUserId, input.teamThreadId);
  } catch {
    throw new TeamStoreError('assignee_no_access');
  }

  // Lecture/flush AUTORITATIVE du brouillon du propriétaire.
  const { digest } = await readOwnerDraft(db, effects, thread.sharerConnectionId, input.draftId);

  const id = crypto.randomUUID();
  const inserted = await db
    .insert(teamDraftReview)
    .values({
      id,
      teamThreadId: input.teamThreadId,
      draftId: input.draftId,
      ownerUserId: userId,
      reviewerUserId: input.reviewerUserId,
      state: 'requested',
      revision: 1,
      draftDigest: digest,
    })
    .onConflictDoNothing()
    .returning({ id: teamDraftReview.id });
  // Index unique PARTIEL (une review ACTIVE par fil+brouillon) : l'absence de
  // retour signifie qu'une review active existe déjà.
  if (inserted.length === 0) throw new TeamStoreError('review_exists');

  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'draft.review_requested',
    subjectId: id,
    metadata: { teamThreadId: input.teamThreadId, reviewerUserId: input.reviewerUserId },
  });
  await notifyDraftReview(db, {
    teamId: thread.teamId,
    teamThreadId: input.teamThreadId,
    actorUserId: userId,
    recipients: [input.reviewerUserId],
  });
  return { id };
}

/** Review active d'un fil + suggestions — contenu des suggestions réservé au couple owner/reviewer. */
export async function getReviewForThread(db: DB, userId: string, teamThreadId: string) {
  await getTeamThread(db, userId, teamThreadId);
  const rows = await db
    .select({
      id: teamDraftReview.id,
      teamThreadId: teamDraftReview.teamThreadId,
      ownerUserId: teamDraftReview.ownerUserId,
      reviewerUserId: teamDraftReview.reviewerUserId,
      state: teamDraftReview.state,
      revision: teamDraftReview.revision,
      draftDigest: teamDraftReview.draftDigest,
      createdAt: teamDraftReview.createdAt,
      updatedAt: teamDraftReview.updatedAt,
      ownerName: user.name,
    })
    .from(teamDraftReview)
    .leftJoin(user, eq(user.id, teamDraftReview.ownerUserId))
    .where(
      and(
        eq(teamDraftReview.teamThreadId, teamThreadId),
        inArray(teamDraftReview.state, [...ACTIVE_REVIEW_STATES]),
      ),
    )
    .orderBy(desc(teamDraftReview.createdAt))
    .limit(1);
  const review = rows[0];
  if (!review) return null;
  const isParty = userId === review.ownerUserId || userId === review.reviewerUserId;
  const reviewerRows = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, review.reviewerUserId))
    .limit(1);
  const suggestions = isParty
    ? await db
        .select({
          id: teamDraftSuggestion.id,
          authorUserId: teamDraftSuggestion.authorUserId,
          authorName: user.name,
          bodyText: teamDraftSuggestion.bodyText,
          note: teamDraftSuggestion.note,
          baseDigest: teamDraftSuggestion.baseDigest,
          appliedAt: teamDraftSuggestion.appliedAt,
          createdAt: teamDraftSuggestion.createdAt,
        })
        .from(teamDraftSuggestion)
        .leftJoin(user, eq(user.id, teamDraftSuggestion.authorUserId))
        .where(eq(teamDraftSuggestion.reviewId, review.id))
        .orderBy(asc(teamDraftSuggestion.createdAt))
        .limit(MAX_SUGGESTIONS_LISTED)
    : [];
  return {
    ...review,
    // draftId reste serveur : il n'apparaît dans AUCUNE réponse.
    reviewerName: reviewerRows[0]?.name ?? '',
    isParty,
    suggestions: suggestions.map((suggestion) => ({
      ...suggestion,
      authorName: suggestion.authorName ?? '',
    })),
  };
}

/** Lecture du brouillon SOUS review — owner et reviewer uniquement, via la connexion du sharer. */
export async function readReviewDraft(
  db: DB,
  effects: DraftReadEffects,
  userId: string,
  reviewId: string,
) {
  const review = await requireReview(db, reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.ownerUserId && userId !== review.reviewerUserId) {
    throw new TeamStoreError('forbidden');
  }
  const { snapshot, digest } = await readOwnerDraft(
    db,
    effects,
    thread.sharerConnectionId,
    review.draftId,
  );
  return {
    snapshot,
    currentDigest: digest,
    reviewDigest: review.draftDigest,
    stale: digest !== review.draftDigest,
    state: review.state,
    revision: review.revision,
  };
}

async function requireFreshDraft(
  db: DB,
  effects: DraftReadEffects,
  review: typeof teamDraftReview.$inferSelect,
  sharerConnectionId: string,
  baseDigest: string,
) {
  const { digest } = await readOwnerDraft(db, effects, sharerConnectionId, review.draftId);
  // Refus si le brouillon RÉEL a divergé de la review OU de ce que le client
  // regardait — les deux formes de staleness bloquent la mutation.
  if (digest !== review.draftDigest || digest !== baseDigest) {
    throw new TeamStoreError('draft_stale');
  }
}

export async function suggestEdit(
  db: DB,
  effects: DraftReadEffects,
  userId: string,
  reviewId: string,
  input: { bodyText: string; note?: string; baseDigest: string },
) {
  const review = await requireReview(db, reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.reviewerUserId) throw new TeamStoreError('not_reviewer');
  if (!isActive(review.state) || review.state === 'approved') {
    throw new TeamStoreError('review_not_actionable');
  }
  await requireFreshDraft(db, effects, review, thread.sharerConnectionId, input.baseDigest);
  const id = crypto.randomUUID();
  await db.insert(teamDraftSuggestion).values({
    id,
    reviewId,
    authorUserId: userId,
    bodyText: input.bodyText.slice(0, MAX_SUGGESTION_BODY),
    note: (input.note ?? '').slice(0, MAX_SUGGESTION_NOTE),
    baseDigest: input.baseDigest,
  });
  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'draft.suggested',
    subjectId: reviewId,
    metadata: { suggestionId: id },
  });
  await notifyDraftReview(db, {
    teamId: thread.teamId,
    teamThreadId: review.teamThreadId,
    actorUserId: userId,
    recipients: [review.ownerUserId],
  });
  return { id };
}

export async function setReviewDecision(
  db: DB,
  effects: DraftReadEffects,
  userId: string,
  reviewId: string,
  input: { decision: 'approved' | 'changes_requested'; baseDigest: string },
) {
  const review = await requireReview(db, reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.reviewerUserId) throw new TeamStoreError('not_reviewer');
  if (!isActive(review.state)) throw new TeamStoreError('review_not_actionable');
  await requireFreshDraft(db, effects, review, thread.sharerConnectionId, input.baseDigest);
  await db
    .update(teamDraftReview)
    .set({ state: input.decision, revision: review.revision + 1, updatedAt: new Date() })
    .where(eq(teamDraftReview.id, reviewId));
  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: input.decision === 'approved' ? 'draft.approved' : 'draft.changes_requested',
    subjectId: reviewId,
    metadata: { revision: review.revision + 1 },
  });
  await notifyDraftReview(db, {
    teamId: thread.teamId,
    teamThreadId: review.teamThreadId,
    actorUserId: userId,
    recipients: [review.ownerUserId],
  });
  return { state: input.decision, revision: review.revision + 1 };
}

/** L'owner a modifié son brouillon : re-lecture autoritative, nouveau digest, nouvelle passe. */
export async function rebaseReview(
  db: DB,
  effects: DraftReadEffects,
  userId: string,
  reviewId: string,
) {
  const review = await requireReview(db, reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.ownerUserId) throw new TeamStoreError('not_draft_owner');
  if (!isActive(review.state)) throw new TeamStoreError('review_not_actionable');
  const { digest } = await readOwnerDraft(db, effects, thread.sharerConnectionId, review.draftId);
  await db
    .update(teamDraftReview)
    .set({
      state: 'requested',
      draftDigest: digest,
      revision: review.revision + 1,
      updatedAt: new Date(),
    })
    .where(eq(teamDraftReview.id, reviewId));
  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'draft.review_rebased',
    subjectId: reviewId,
    metadata: { revision: review.revision + 1 },
  });
  await notifyDraftReview(db, {
    teamId: thread.teamId,
    teamThreadId: review.teamThreadId,
    actorUserId: userId,
    recipients: [review.reviewerUserId],
  });
  return { revision: review.revision + 1 };
}

/** Trace « appliquée dans le composeur du propriétaire » — aucune écriture Gmail serveur. */
export async function markSuggestionApplied(db: DB, userId: string, suggestionId: string) {
  const rows = await db
    .select()
    .from(teamDraftSuggestion)
    .where(eq(teamDraftSuggestion.id, suggestionId))
    .limit(1);
  const suggestion = rows[0];
  if (!suggestion) throw new TeamStoreError('not_found');
  const review = await requireReview(db, suggestion.reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.ownerUserId) throw new TeamStoreError('not_draft_owner');
  await db
    .update(teamDraftSuggestion)
    .set({ appliedAt: new Date(), appliedBy: userId })
    .where(eq(teamDraftSuggestion.id, suggestionId));
  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'draft.suggestion_applied',
    subjectId: suggestion.reviewId,
    metadata: { suggestionId },
  });
}

export async function cancelReview(db: DB, userId: string, reviewId: string) {
  const review = await requireReview(db, reviewId);
  const thread = await getTeamThread(db, userId, review.teamThreadId);
  if (userId !== review.ownerUserId && userId !== review.reviewerUserId) {
    throw new TeamStoreError('forbidden');
  }
  if (!isActive(review.state)) throw new TeamStoreError('review_not_actionable');
  await db
    .update(teamDraftReview)
    .set({ state: 'cancelled', revision: review.revision + 1, updatedAt: new Date() })
    .where(eq(teamDraftReview.id, reviewId));
  await audit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'draft.review_cancelled',
    subjectId: reviewId,
  });
  await notifyDraftReview(db, {
    teamId: thread.teamId,
    teamThreadId: review.teamThreadId,
    actorUserId: userId,
    recipients: [userId === review.ownerUserId ? review.reviewerUserId : review.ownerUserId],
  });
}

/**
 * À l'ACCEPTATION durable de l'envoi : les reviews ACTIVES du fil passent en
 * 'completed' (terminal, honnête — pas « sent » : la remise Gmail n'est pas
 * prouvée ici, un échec ultérieur reste visible dans la Queue).
 */
export async function markThreadReviewsCompleted(db: DB, userId: string, teamThreadId: string) {
  const thread = await getTeamThread(db, userId, teamThreadId);
  const reviews = await db
    .select({ id: teamDraftReview.id, revision: teamDraftReview.revision })
    .from(teamDraftReview)
    .where(
      and(
        eq(teamDraftReview.teamThreadId, teamThreadId),
        inArray(teamDraftReview.state, [...ACTIVE_REVIEW_STATES]),
      ),
    );
  for (const review of reviews) {
    await db
      .update(teamDraftReview)
      .set({ state: 'completed', revision: review.revision + 1, updatedAt: new Date() })
      .where(eq(teamDraftReview.id, review.id));
    await audit(db, {
      teamId: thread.teamId,
      actorUserId: userId,
      action: 'draft.review_completed',
      subjectId: review.id,
    });
  }
  return { closed: reviews.length };
}

// --- intent de réponse (baseline SERVEUR) ------------------------------------

const REPLY_INTENT_TTL_MS = 24 * 3_600_000;
/** Fenêtre pendant laquelle une collision détectée « arme » l'override. */
const OVERRIDE_ARM_WINDOW_MS = 10 * 60_000;

/**
 * Émis à l'OUVERTURE du composeur, sous ACL : la baseline de collision est un
 * fait SERVEUR — aucun timestamp client n'est jamais accepté. L'intent lie
 * (utilisateur, fil d'équipe, fil provider) et expire.
 */
export async function createReplyIntent(db: DB, userId: string, teamThreadId: string) {
  const thread = await getTeamThread(db, userId, teamThreadId);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(teamReplyIntent).values({
    id,
    teamThreadId,
    userId,
    providerThreadId: thread.threadId,
    baselineAt: now,
    expiresAt: new Date(now.getTime() + REPLY_INTENT_TTL_MS),
  });
  return {
    id,
    baselineAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REPLY_INTENT_TTL_MS).toISOString(),
  };
}

/** Valide l'intent pour CET envoi : propriétaire, fil d'équipe, fil provider, non expiré. */
export async function getValidReplyIntent(
  db: DB,
  userId: string,
  input: { intentId: string; teamThreadId: string; providerThreadId: string },
) {
  const rows = await db
    .select()
    .from(teamReplyIntent)
    .where(eq(teamReplyIntent.id, input.intentId))
    .limit(1);
  const intent = rows[0];
  if (
    !intent ||
    intent.userId !== userId ||
    intent.teamThreadId !== input.teamThreadId ||
    intent.providerThreadId !== input.providerThreadId ||
    intent.expiresAt.getTime() <= Date.now()
  ) {
    throw new TeamStoreError('reply_intent_invalid');
  }
  return {
    baselineAtMs: intent.baselineAt.getTime(),
    collisionDetectedAtMs: intent.collisionDetectedAt?.getTime() ?? null,
    overrideConsumedAtMs: intent.overrideConsumedAt?.getTime() ?? null,
  };
}

/** Une collision serveur vient d'être détectée pour cet intent — elle ARME l'override. */
export async function markIntentCollision(db: DB, intentId: string) {
  await db
    .update(teamReplyIntent)
    .set({ collisionDetectedAt: new Date() })
    .where(eq(teamReplyIntent.id, intentId));
}

/**
 * Consomme l'override — ONE-SHOT et armé serveur : accepté UNIQUEMENT si une
 * collision a été détectée récemment pour CET intent et qu'aucun override n'a
 * déjà été consommé. Update conditionnel atomique.
 */
export async function consumeIntentOverride(db: DB, intentId: string) {
  const now = Date.now();
  const updated = await db
    .update(teamReplyIntent)
    .set({ overrideConsumedAt: new Date(now) })
    .where(
      and(
        eq(teamReplyIntent.id, intentId),
        isNotNull(teamReplyIntent.collisionDetectedAt),
        gt(teamReplyIntent.collisionDetectedAt, new Date(now - OVERRIDE_ARM_WINDOW_MS)),
        isNull(teamReplyIntent.overrideConsumedAt),
      ),
    )
    .returning({ id: teamReplyIntent.id });
  if (updated.length === 0) throw new TeamStoreError('override_not_armed');
}

/** Claim déjà détenu par CE user avec CETTE clé (retry idempotent — bypass du préflight). */
export async function findOwnReplyClaim(
  db: DB,
  userId: string,
  teamThreadId: string,
  clientSubmissionKey: string,
) {
  const rows = await db
    .select({ id: teamReplyClaim.id, outcome: teamReplyClaim.outcome })
    .from(teamReplyClaim)
    .where(
      and(
        eq(teamReplyClaim.teamThreadId, teamThreadId),
        eq(teamReplyClaim.userId, userId),
        eq(teamReplyClaim.clientSubmissionKey, clientSubmissionKey),
        inArray(teamReplyClaim.outcome, ['active', 'accepted']),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// --- collision d'envoi --------------------------------------------------------

/**
 * CLAIM atomique de réponse : UN claim actif par fil partagé (index unique
 * partiel). Un retry du MÊME acteur avec la MÊME clé d'idempotence réutilise
 * son claim ; tout autre acteur ou clé est refusé tant que le claim est actif.
 */
export async function claimTeamReply(
  db: DB,
  userId: string,
  input: { teamThreadId: string; clientSubmissionKey: string; reviewId?: string | null },
) {
  await getTeamThread(db, userId, input.teamThreadId);
  // reviewId (durci) : jamais accepté aveuglément — la review doit exister,
  // appartenir EXACTEMENT à ce fil d'équipe, et l'appelant doit être une
  // partie (owner ou reviewer). Sinon : refus AVANT tout claim.
  if (input.reviewId) {
    const reviews = await db
      .select({
        teamThreadId: teamDraftReview.teamThreadId,
        ownerUserId: teamDraftReview.ownerUserId,
        reviewerUserId: teamDraftReview.reviewerUserId,
      })
      .from(teamDraftReview)
      .where(eq(teamDraftReview.id, input.reviewId))
      .limit(1);
    const review = reviews[0];
    if (!review || review.teamThreadId !== input.teamThreadId) {
      throw new TeamStoreError('not_found');
    }
    if (userId !== review.ownerUserId && userId !== review.reviewerUserId) {
      throw new TeamStoreError('forbidden');
    }
  }
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(teamReplyClaim)
    .values({
      id,
      teamThreadId: input.teamThreadId,
      userId,
      reviewId: input.reviewId ?? null,
      clientSubmissionKey: input.clientSubmissionKey,
      outcome: 'active',
    })
    .onConflictDoNothing()
    .returning({ id: teamReplyClaim.id });
  if (inserted.length > 0) return { id, reused: false };
  const activeRows = await db
    .select()
    .from(teamReplyClaim)
    .where(
      and(
        eq(teamReplyClaim.teamThreadId, input.teamThreadId),
        eq(teamReplyClaim.outcome, 'active'),
      ),
    )
    .limit(1);
  const active = activeRows[0];
  if (
    active &&
    active.userId === userId &&
    active.clientSubmissionKey === input.clientSubmissionKey
  ) {
    // Double clic / retry réseau du même envoi : idempotent.
    return { id: active.id, reused: true };
  }
  throw new TeamStoreError('reply_claimed');
}

export async function resolveTeamReplyClaim(
  db: DB,
  claimId: string,
  outcome: 'accepted' | 'released',
) {
  await db
    .update(teamReplyClaim)
    .set({ outcome, resolvedAt: new Date() })
    .where(and(eq(teamReplyClaim.id, claimId), eq(teamReplyClaim.outcome, 'active')));
}

/**
 * Préflight de collision — LECTURES seulement. Les messages fournis par la
 * route sont des MÉTADONNÉES du fil du propriétaire (expéditeur + date,
 * jamais de corps) relues à l'instant de l'envoi.
 */
export async function sendCollisionPreflight(
  db: DB,
  userId: string,
  input: {
    teamThreadId: string;
    baselineMs: number;
    threadMessages: Array<{ senderEmail: string; receivedOnMs: number | null }>;
    myEmails: string[];
  },
): Promise<{ reasons: CollisionReason[] }> {
  const thread = await getTeamThread(db, userId, input.teamThreadId);
  const members = await db
    .select({ userId: teamMember.userId, email: user.email })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, thread.teamId));
  const memberEmails = new Set(members.map((member) => member.email.toLowerCase()));
  const myEmails = new Set(input.myEmails.map((email) => email.toLowerCase()));

  const reasons: CollisionReason[] = [];
  for (const reply of detectInboundMemberReplies(
    input.threadMessages,
    memberEmails,
    myEmails,
    input.baselineMs,
  )) {
    reasons.push({
      type: 'inbound_member_reply',
      senderEmail: reply.senderEmail,
      receivedOn: new Date(reply.receivedOnMs).toISOString(),
    });
  }

  const claims = await db
    .select({
      userId: teamReplyClaim.userId,
      outcome: teamReplyClaim.outcome,
      createdAt: teamReplyClaim.createdAt,
      resolvedAt: teamReplyClaim.resolvedAt,
    })
    .from(teamReplyClaim)
    .where(
      and(
        eq(teamReplyClaim.teamThreadId, input.teamThreadId),
        gt(teamReplyClaim.createdAt, new Date(input.baselineMs - 60_000)),
      ),
    )
    .orderBy(desc(teamReplyClaim.createdAt))
    .limit(20);
  for (const claim of claims) {
    if (claim.userId === userId) continue;
    if (claim.outcome === 'accepted') {
      reasons.push({
        type: 'reta_reply_accepted',
        userId: claim.userId,
        acceptedAt: (claim.resolvedAt ?? claim.createdAt).toISOString(),
      });
    } else if (claim.outcome === 'active') {
      reasons.push({
        type: 'active_claim',
        userId: claim.userId,
        since: claim.createdAt.toISOString(),
      });
    }
  }
  return { reasons };
}
