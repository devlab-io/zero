/**
 * Brouillons de reply explicitement abandonnés (CUA round 4, échec 2).
 *
 * Un composer vidé puis fermé supprime son brouillon serveur en best-effort,
 * mais l'id de brouillon Gmail n'est pas toujours connu (le fil n'expose que
 * l'id de MESSAGE du brouillon via latestDraft, et une sauvegarde tardive peut
 * créer un brouillon dont l'id n'a jamais atteint l'URL). Cette liste locale
 * garantit la non-résurrection quoi qu'il arrive : un latestDraft dont l'id de
 * message est marqué abandonné ne ressème JAMAIS son contenu dans le composer
 * (le « a » du round 4 était le brouillon abandonné du round 3, resservi par
 * `initialMessage={latestDraft?.decodedBody}`).
 */
const STORAGE_KEY = 'zero:abandoned-reply-drafts';
const MAX_ENTRIES = 50;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markDraftAbandoned(messageId: string): void {
  try {
    const next = [messageId, ...read().filter((id) => id !== messageId)].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage indisponible : la suppression serveur reste la seule défense.
  }
}

export function isDraftAbandoned(messageId: string | undefined): boolean {
  if (!messageId) return false;
  return read().includes(messageId);
}
