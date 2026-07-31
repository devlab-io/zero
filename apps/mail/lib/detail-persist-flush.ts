/**
 * Flush immédiat du persister après un openThread réussi (r16).
 *
 * L'écriture des corps passait uniquement par l'abonnement throttlé du
 * PersistQueryClientProvider : un reload juste après la lecture pouvait
 * perdre l'entrée lourde. Le queryFn openThread demande désormais un persist
 * EXPLICITE via ce registre ; le provider enregistre le flusher du couple
 * (owner, persister) COURANT et le désenregistre au switch/logout — une
 * demande orpheline (déconnexion en cours) est un no-op, jamais une écriture
 * sous la mauvaise clé.
 *
 * Coalescence courte : un clic + les deux suivants préchauffés déclenchent
 * plusieurs openThread en rafale — une seule sérialisation/écriture pour la
 * fenêtre, pas une par réponse (le coût est le JSON.stringify des Mo de
 * corps, voir selectQueriesForPersistence).
 */

export const DETAIL_PERSIST_COALESCE_MS = 150;

let flusher: (() => void) | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export function registerDetailPersistFlusher(fn: (() => void) | null): void {
  flusher = fn;
  if (fn === null && pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

export function requestImmediateDetailPersist(): void {
  if (flusher === null || pendingTimer !== null) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    // Relu au tir : un désenregistrement pendant la fenêtre annule le timer,
    // mais on garde la garde par sûreté (registre = source de vérité).
    flusher?.();
  }, DETAIL_PERSIST_COALESCE_MS);
}

export function __resetDetailPersistFlushForTests(): void {
  registerDetailPersistFlusher(null);
}
