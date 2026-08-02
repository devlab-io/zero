/**
 * Préparation PURE d'une issue Linear depuis un fil partagé (P18) : titre
 * dérivé du sujet, description = extrait AUTORISÉ + backlink Reta ACL vers le
 * fil — jamais le corps complet du mail, jamais de pièce jointe. Les
 * suggestions de lien sont des identifiants détectés dans le texte visible :
 * APERÇU seulement, rien n'est persisté avant un Accept explicite.
 */

const IDENTIFIER_PATTERN = /\b[A-Z][A-Z0-9]{0,9}-\d{1,8}\b/g;
const MAX_SUGGESTIONS = 5;
const MAX_TITLE_CHARS = 200;
const MAX_EXCERPT_CHARS = 500;

/**
 * Identifiants d'issue (ex. ENG-123) détectés dans un texte visible —
 * MAJUSCULES seulement, comme Linear les affiche : « devis-3 » n'est pas une
 * issue.
 */
export function detectIssueIdentifiers(text: string): string[] {
  const found = text.match(IDENTIFIER_PATTERN) ?? [];
  return [...new Set(found)].slice(0, MAX_SUGGESTIONS);
}

export function buildIssueDraft(input: {
  subject: string;
  excerpt?: string;
  teamThreadId: string;
  teamId: string;
  appOrigin: string;
}): { title: string; description: string; backlinkUrl: string } {
  const title = (input.subject.trim() || 'Email thread').slice(0, MAX_TITLE_CHARS);
  const backlinkUrl = `${input.appOrigin.replace(/\/$/, '')}/team?team=${encodeURIComponent(
    input.teamId,
  )}&thread=${encodeURIComponent(input.teamThreadId)}`;
  const excerpt = (input.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
  const description = [excerpt ? `> ${excerpt}` : null, `[Reta thread](${backlinkUrl})`]
    .filter(Boolean)
    .join('\n\n');
  return { title, description, backlinkUrl };
}
