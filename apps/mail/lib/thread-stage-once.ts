/**
 * Dédupe par fil des jalons perf du lecteur (r15a).
 *
 * Preuve CUA (thread 19f910a10c143d02 puis gros mail ChatGPT) : l'ancien
 * `thread:body-ready` était posé à chaque transition de données — trois
 * mesures (7430/9846/10460 ms) pour une seule lecture, aucune ne représentant
 * le DOM visible. Chaque jalon de lecture est désormais posé UNE fois par fil
 * ouvert : la ref porte le dernier id marqué ; revenir sur un fil déjà lu
 * (A→B→A) re-mesure honnêtement la nouvelle ouverture.
 */
export function markThreadStageOnce(
  ref: { current: string | null },
  threadId: string | null | undefined,
  mark: () => void,
): boolean {
  if (!threadId || ref.current === threadId) return false;
  ref.current = threadId;
  mark();
  return true;
}
