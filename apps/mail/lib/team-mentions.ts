/**
 * Mentions @ dans les commentaires d'équipe — logique PURE (testée sans DOM).
 * Convention : le corps reste du texte brut « @Nom Affiché » ; l'autocomplete
 * suit le token « @… » au caret, et la résolution finale ne retient que les
 * membres dont le @nom apparaît réellement dans le corps au moment du submit
 * (une mention effacée ne notifie personne).
 */

export type MentionMember = { userId: string; name: string; email: string };

export type MentionQuery = { query: string; start: number } | null;

/** Token « @… » en cours de frappe au caret (jusqu'à 40 chars, sans saut de ligne). */
export function extractMentionQuery(text: string, caret: number): MentionQuery {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  // Le « @ » doit débuter le texte ou suivre un séparateur.
  if (at > 0 && !/[\s([{.,;:!?'"«»-]/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || query.includes('\n') || query.includes('@')) return null;
  return { query, start: at };
}

/** Membres proposés pour un token (préfixe insensible à la casse sur nom/email). */
export function filterMentionCandidates(members: MentionMember[], query: string): MentionMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice(0, 8);
  return members
    .filter(
      (member) => member.name.toLowerCase().includes(q) || member.email.toLowerCase().startsWith(q),
    )
    .slice(0, 8);
}

/** Remplace le token en cours par « @Nom » suivi d'une espace, caret replacé après. */
export function applyMention(
  text: string,
  caret: number,
  start: number,
  member: MentionMember,
): { text: string; caret: number } {
  const inserted = `@${member.name} `;
  const next = text.slice(0, start) + inserted + text.slice(caret);
  return { text: next, caret: start + inserted.length };
}

/** Mentions retenues au submit : membres suivis dont le @nom est encore présent. */
export function resolveMentions(body: string, tracked: MentionMember[]): string[] {
  const lower = body.toLowerCase();
  const seen = new Set<string>();
  for (const member of tracked) {
    if (lower.includes(`@${member.name.toLowerCase()}`)) seen.add(member.userId);
  }
  return [...seen];
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; userId: string };

/** Découpe un corps en segments texte/mention pour le rendu surligné. */
export function segmentMentions(body: string, members: MentionMember[]): MentionSegment[] {
  if (members.length === 0 || !body.includes('@')) return [{ type: 'text', text: body }];
  // Les noms les plus longs d'abord — « @Jean-Paul Dupont » gagne sur « @Jean ».
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const segments: MentionSegment[] = [];
  const lower = body.toLowerCase();
  // `scan` avance sur chaque « @ » ; `lastEmit` marque le début du texte non
  // encore émis — un « @ » sans membre correspondant reste donc du texte.
  let scan = 0;
  let lastEmit = 0;
  while (scan < body.length) {
    const at = body.indexOf('@', scan);
    if (at === -1) break;
    const match = sorted.find((member) => lower.startsWith(`@${member.name.toLowerCase()}`, at));
    if (!match) {
      scan = at + 1;
      continue;
    }
    if (at > lastEmit) segments.push({ type: 'text', text: body.slice(lastEmit, at) });
    segments.push({
      type: 'mention',
      text: body.slice(at, at + match.name.length + 1),
      userId: match.userId,
    });
    scan = at + match.name.length + 1;
    lastEmit = scan;
  }
  if (lastEmit < body.length) segments.push({ type: 'text', text: body.slice(lastEmit) });
  if (segments.length === 0) return [{ type: 'text', text: body }];
  return segments;
}
