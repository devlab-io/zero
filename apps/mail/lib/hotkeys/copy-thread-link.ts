/**
 * mod+C — copier le lien du fil (parité Shortwave, r18). Le lien profond
 * /mail/<dossier>?threadId=<id> est fiable : c'est l'URL exacte du lecteur,
 * restaurée en priorité au boot (r16). La copie NATIVE garde toujours la
 * main : le raccourci ne fait rien (et ne preventDefault jamais) dès qu'une
 * sélection de texte existe ou que le focus est éditable.
 */
export function buildThreadLink(origin: string, folder: string, threadId: string): string {
  return `${origin}/mail/${encodeURIComponent(folder)}?threadId=${encodeURIComponent(threadId)}`;
}

export function shouldCopyThreadLink(input: {
  threadId: string | null;
  hasTextSelection: boolean;
  isTypingTarget: boolean;
}): boolean {
  return Boolean(input.threadId) && !input.hasTextSelection && !input.isTypingTarget;
}
