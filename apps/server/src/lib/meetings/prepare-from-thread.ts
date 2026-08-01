/**
 * P11 — préparation de RDV depuis un fil email : PREVIEW ÉDITABLE seulement.
 * Aucune création d'événement, aucune invitation, AUCUN nouveau scope OAuth :
 * tout se construit depuis la lecture du fil déjà autorisée (connexion
 * active). La création réelle (calendrier + visio) restera une action humaine
 * distincte derrière des scopes incrémentaux dédiés (calendar.freebusy pour
 * les disponibilités, scope de création séparé) — hors de ce module.
 */

export type MeetingParticipant = {
  email: string;
  name?: string;
  /** L'utilisateur lui-même (organisateur) — affiché mais non ré-invité. */
  isSelf: boolean;
};

export type MeetingPreview = {
  subject: string;
  participants: MeetingParticipant[];
  /** Extrait borné du dernier message — contexte de l'invitation, éditable. */
  context: string;
  /** Fuseau IANA d'affichage des créneaux (réglage utilisateur, sinon local). */
  timeZone: string | null;
  suggestedDurationMinutes: number;
  /** Adresses écartées (no-reply, listes) — VISIBLES pour contrôle humain. */
  excluded: { email: string; reason: 'no-reply' | 'mailing-list' }[];
  /** Les disponibilités exigent calendar.freebusy (scope incrémental futur). */
  availabilityRequiresCalendarScope: true;
  /** Aucune création ici — la preview est le SEUL produit de cet appel. */
  creationRequiresHumanConfirmation: true;
};

const MAX_PARTICIPANTS = 15;
const MAX_CONTEXT_CHARS = 400;

const NO_REPLY_PATTERN =
  /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|notifications?|newsletter|bounce)[@.+_-]/i;

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** « Re: Re: Fwd: Sujet » → « Sujet ». */
export const cleanSubject = (subject: string): string =>
  subject.replace(/^\s*((re|fwd?|tr)\s*:\s*)+/i, '').trim();

export type ThreadForMeeting = {
  messages: {
    sender: { name?: string; email: string };
    to: { name?: string; email: string }[];
    cc?: { name?: string; email: string }[] | null;
    subject: string;
    listUnsubscribe?: string;
    decodedBody?: string;
    body?: string;
  }[];
};

export function buildMeetingPreview(
  thread: ThreadForMeeting,
  options: { selfEmail: string; timeZone?: string | null },
): MeetingPreview {
  const selfEmail = options.selfEmail.trim().toLowerCase();
  const participants = new Map<string, MeetingParticipant>();
  const excluded = new Map<string, { email: string; reason: 'no-reply' | 'mailing-list' }>();
  const listSenders = new Set(
    thread.messages
      .filter((message) => message.listUnsubscribe)
      .map((message) => message.sender.email.toLowerCase()),
  );

  for (const message of thread.messages) {
    for (const candidate of [message.sender, ...message.to, ...(message.cc ?? [])]) {
      const email = candidate?.email?.trim().toLowerCase();
      if (!email || participants.has(email) || excluded.has(email)) continue;
      // List-Unsubscribe prime sur le motif d'adresse : « mailing-list » est
      // la raison la plus précise quand les deux s'appliquent.
      if (listSenders.has(email)) {
        excluded.set(email, { email, reason: 'mailing-list' });
        continue;
      }
      if (NO_REPLY_PATTERN.test(email)) {
        excluded.set(email, { email, reason: 'no-reply' });
        continue;
      }
      if (participants.size >= MAX_PARTICIPANTS) continue;
      participants.set(email, {
        email,
        name: candidate.name,
        isSelf: email === selfEmail,
      });
    }
  }

  const latest = thread.messages[thread.messages.length - 1];
  const baseSubject = cleanSubject(latest?.subject ?? '');
  return {
    subject: baseSubject ? `RDV — ${baseSubject}` : 'RDV',
    participants: [...participants.values()],
    context: stripHtml(latest?.decodedBody || latest?.body || '').slice(0, MAX_CONTEXT_CHARS),
    timeZone: options.timeZone ?? null,
    suggestedDurationMinutes: 30,
    excluded: [...excluded.values()],
    availabilityRequiresCalendarScope: true,
    creationRequiresHumanConfirmation: true,
  };
}
