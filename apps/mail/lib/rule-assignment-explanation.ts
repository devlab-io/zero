/**
 * « Pourquoi ce fil m'a été assigné » (P14, panneau Team) — extraction PURE :
 * le DERNIER run appliqué de ce fil dont une action assign ou todo a réussi.
 * Le serveur a déjà filtré par ACL et masqué inverse/applied/connectionId —
 * ici on ne fait que choisir la ligne à montrer.
 */

export type RuleRunSummary = {
  id: string;
  ruleName: string;
  outcome: string;
  reason: string;
  createdAt: string | Date;
  actionsApplied: Array<{ kind: string; ok: boolean; reason?: string }>;
};

export function assignmentExplanation(
  runs: readonly RuleRunSummary[],
): { ruleName: string; reason: string } | null {
  const candidates = runs
    .filter(
      (run) =>
        run.outcome === 'applied' &&
        run.actionsApplied.some(
          (action) => (action.kind === 'assign' || action.kind === 'todo') && action.ok,
        ),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latest = candidates[0];
  return latest ? { ruleName: latest.ruleName, reason: latest.reason } : null;
}
