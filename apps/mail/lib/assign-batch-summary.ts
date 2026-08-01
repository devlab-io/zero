/**
 * P5 — résumé HONNÊTE d'une assignation batch : chaque catégorie non nulle est
 * énoncée (assignés / non partagés avec l'équipe / assigné sans accès) — un
 * skip n'est jamais silencieux. Logique pure, testée sans UI.
 */
export type AssignBatchCounts = {
  assigned: number;
  notShared: number;
  skipped: number;
};

export function summarizeAssignOutcomes(
  counts: AssignBatchCounts,
  labels: {
    assigned: (count: number) => string;
    notShared: (count: number) => string;
    skipped: (count: number) => string;
  },
): string {
  const parts: string[] = [];
  if (counts.assigned > 0) parts.push(labels.assigned(counts.assigned));
  if (counts.notShared > 0) parts.push(labels.notShared(counts.notShared));
  if (counts.skipped > 0) parts.push(labels.skipped(counts.skipped));
  return parts.join(' · ');
}
