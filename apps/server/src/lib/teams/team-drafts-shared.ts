/**
 * Types et fonctions PARTAGÉS des brouillons collaboratifs (P15) — module
 * feuille STRICT : aucun import de module (crypto global uniquement). La
 * frontière tRPC peut le référencer sans tirer le graphe serveur.
 */

export type DraftReviewState =
  | 'requested'
  | 'changes_requested'
  | 'approved'
  | 'cancelled'
  | 'completed';

export const ACTIVE_REVIEW_STATES: readonly DraftReviewState[] = [
  'requested',
  'changes_requested',
  'approved',
] as const;

/**
 * Instantané NORMALISÉ d'un brouillon pour le digest : prose + enveloppe
 * d'affichage. PJ, threading et signature n'y participent pas — ils sont hors
 * du périmètre de relecture texte.
 */
export type DraftSnapshot = {
  subject: string;
  bodyText: string;
  to: string[];
  cc: string[];
  bcc: string[];
};

const MAX_DRAFT_BODY_CHARS = 100_000;

const normalizeList = (values: string[] | null | undefined): string[] =>
  [...new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();

export function normalizeDraftSnapshot(input: {
  subject?: string | null;
  content?: string | null;
  to?: string[] | null;
  cc?: string[] | null;
  bcc?: string[] | null;
}): DraftSnapshot {
  return {
    subject: (input.subject ?? '').trim(),
    bodyText: (input.content ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DRAFT_BODY_CHARS),
    to: normalizeList(input.to),
    cc: normalizeList(input.cc),
    bcc: normalizeList(input.bcc),
  };
}

/** SHA-256 hex du JSON canonique de l'instantané — le « digest serveur ». */
export async function computeDraftDigest(snapshot: DraftSnapshot): Promise<string> {
  const canonical = JSON.stringify([
    snapshot.subject,
    snapshot.bodyText,
    snapshot.to,
    snapshot.cc,
    snapshot.bcc,
  ]);
  const bytes = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- collision d'envoi (préflight PUR) ---------------------------------------

export type CollisionReason =
  | { type: 'inbound_member_reply'; senderEmail: string; receivedOn: string }
  /**
   * Réponse dont la ligne send_job durable a été ACCEPTÉE via Reta — vaut
   * pour l'envoi immédiat (Queue) comme pour le planifié long-terme (sweep) ;
   * jamais une remise Gmail prouvée.
   */
  | { type: 'reta_reply_accepted'; userId: string; acceptedAt: string }
  | { type: 'active_claim'; userId: string; since: string };

/**
 * Détection PURE des réponses ENTRANTES d'un coéquipier depuis l'ouverture du
 * composeur : messages du fil du PROPRIÉTAIRE (métadonnées seules — jamais de
 * corps) dont l'expéditeur est l'email d'un membre (hors soi-même) et reçus
 * après la baseline.
 */
export function detectInboundMemberReplies(
  messages: ReadonlyArray<{ senderEmail: string; receivedOnMs: number | null }>,
  memberEmails: ReadonlySet<string>,
  myEmails: ReadonlySet<string>,
  baselineMs: number,
): Array<{ senderEmail: string; receivedOnMs: number }> {
  return messages
    .filter(
      (message): message is { senderEmail: string; receivedOnMs: number } =>
        message.receivedOnMs !== null &&
        message.receivedOnMs > baselineMs &&
        memberEmails.has(message.senderEmail.toLowerCase()) &&
        !myEmails.has(message.senderEmail.toLowerCase()),
    )
    .map((message) => ({
      senderEmail: message.senderEmail.toLowerCase(),
      receivedOnMs: message.receivedOnMs,
    }));
}
