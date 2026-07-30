/**
 * Import dynamique mémoïsé, sûr au retry (CUA 2026-07-30, revue Codex).
 *
 * Un seul appel réel de `factory` tant que la promesse vit — le warm
 * (preload) et `React.lazy` partagent la même invocation, ce qui supprime
 * aussi la course d'interception des mocks vitest quand deux imports
 * première-fois du même module partent dans le même tick.
 *
 * Sur REJET, le cache est réinitialisé : un échec réseau transitoire pendant
 * un warm n'empoisonne pas les tentatives suivantes (sans cette remise à
 * zéro, la promesse rejetée restait servie à jamais, y compris au premier
 * rendu lazy). L'observateur interne rend le rejet « géré » — pas
 * d'unhandledrejection même si l'appelant n'attache aucun handler — et le
 * garde `cached === attempt` évite d'écraser une tentative plus récente.
 */
export function memoizedImport<T>(factory: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) {
      const attempt = factory();
      attempt.catch(() => {
        if (cached === attempt) cached = null;
      });
      cached = attempt;
    }
    return cached;
  };
}
