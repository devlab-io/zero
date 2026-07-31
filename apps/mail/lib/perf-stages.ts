/**
 * Jalons de performance par étapes (contrat shortwave-parity, item 6).
 *
 * Chaque étape clé du chemin critique pose un `performance.mark` préfixé
 * `zero:` ; les paires connues produisent automatiquement le
 * `performance.measure` correspondant. Zéro coût réseau, zéro log : les durées
 * se lisent dans DevTools (onglet Performance / `performance.getEntriesByType
 * ('measure')`) et par les runs CUA. Toujours silencieux en cas de marque
 * manquante (page rechargée au milieu d'un parcours).
 */

/** Étape → étape de départ de la mesure auto. */
const MEASURE_FROM: Record<string, string> = {
  'search:results-settled': 'search:applied',
  // r15a : l'ancien `thread:body-ready` mélangeait deux réalités. Découpage
  // honnête — `data-ready` : les messages du fil sont en cache (données
  // présentes, rien n'est peint) ; `content-painted` : le corps traité du
  // message actif est injecté dans le shadow DOM ET un frame a été présenté
  // (double rAF). C'est `content-painted` qui se compare au « corps visible »
  // de Shortwave. Chaque jalon est posé une fois par fil ouvert
  // (lib/thread-stage-once.ts).
  'thread:data-ready': 'thread:open',
  'thread:content-painted': 'thread:open',
  // r9 (cold boot) : `zero:boot:session-prime` est posé par le script inline
  // du <head> (lib/session-prime.ts) au parse du HTML. Ces deux mesures
  // découpent le waterfall du reload authentifié : amorce → identité
  // confirmée (RTT session recouverte par le bundle), puis confirmation →
  // restore du cache owner-scopé. La CUA lit les measures directement.
  'boot:session-confirmed': 'boot:session-prime',
  'boot:cache-restored': 'boot:session-confirmed',
  // r10 : le persister est scindé — les corps de mails s'hydratent APRÈS le
  // premier paint ; cette mesure isole ce second temps du restore.
  'boot:details-restored': 'boot:cache-restored',
  // r12 (diagnostic) : découpage du segment restant après confirmation —
  // montage de la route mail, premières données de liste NON VIDES, puis
  // peinture réellement présentée (commit + double rAF).
  'boot:route-mounted': 'boot:session-confirmed',
  'boot:list-data-ready': 'boot:route-mounted',
  'boot:list-painted': 'boot:list-data-ready',
  // r7 : « ouverture perçue » = le shell projection (sujet/expéditeur +
  // squelette) est peint, avant le corps. C'est la mesure honnête de la cible
  // <300 ms sur une ouverture profonde à froid : le corps complet reste borné
  // par un RTT openThread quand la file de réchauffage (2 en vol, délibérément
  // bornée pour ne pas concurrencer la pagination) n'a pas atteint la ligne.
  'thread:shell-ready': 'thread:open',
  // `send:dispatched` = la requête quitte le composer verrouillé ;
  // `send:confirmed` = le serveur a accepté/enfilé. L'écart mesure exactement
  // la round-trip qui bloque encore la fermeture tant qu'aucune outbox durable
  // n'est branchée sur compose/reply.
  'send:confirmed': 'send:dispatched',
};

export function markStage(
  stage:
    | 'search:applied'
    | 'search:results-settled'
    | 'thread:open'
    | 'thread:shell-ready'
    | 'thread:data-ready'
    | 'thread:content-painted'
    | 'send:dispatched'
    | 'send:confirmed'
    | 'boot:session-confirmed'
    | 'boot:cache-restored'
    | 'boot:details-restored'
    | 'boot:route-mounted'
    | 'boot:list-data-ready'
    | 'boot:list-painted',
): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(`zero:${stage}`);
    const from = MEASURE_FROM[stage];
    if (from) {
      performance.measure(`zero:${from}->${stage}`, `zero:${from}`, `zero:${stage}`);
    }
  } catch {
    // Marque de départ absente — parcours entamé avant le chargement : ignoré.
  }
  // r13 : chaque jalon est aussi un ÉVÉNEMENT — les travaux différés (sidebar,
  // menus) attendent le signal réel boot:list-painted au lieu de se déclencher
  // sur leur propre montage (whenBootStage). Le dispatch est INDÉPENDANT de la
  // mesure : une marque de départ absente ne doit jamais avaler le signal.
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(PERF_STAGE_EVENT, { detail: stage }));
    }
  } catch {
    // environnement sans CustomEvent
  }
}

/** Nom d'événement émis à chaque markStage (detail = nom du jalon). */
export const PERF_STAGE_EVENT = 'zero:perf-stage';

/**
 * Exécute `run` quand le jalon `stage` est atteint (r13). Trois chemins :
 * déjà marqué → exécution immédiate ; sinon abonnement à PERF_STAGE_EVENT ;
 * et un FALLBACK borné (boîte vide, erreur de liste : le jalon ne viendra
 * jamais — la sidebar doit apparaître quand même). Retourne une annulation
 * (unmount / changement d'owner) ; `run` s'exécute au plus une fois.
 */
export function whenBootStage(
  stage: Stage,
  run: () => void,
  options?: { fallbackMs?: number },
): () => void {
  if (typeof window === 'undefined') return () => {};
  const fallbackMs = options?.fallbackMs ?? 2_500;

  if (
    typeof performance !== 'undefined' &&
    performance.getEntriesByName(`zero:${stage}`, 'mark').length > 0
  ) {
    run();
    return () => {};
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    run();
  };
  const onStage = (event: Event) => {
    if ((event as CustomEvent).detail === stage) finish();
  };
  const timerId = window.setTimeout(finish, fallbackMs);
  const cleanup = () => {
    window.removeEventListener(PERF_STAGE_EVENT, onStage);
    window.clearTimeout(timerId);
  };
  window.addEventListener(PERF_STAGE_EVENT, onStage);

  return () => {
    done = true;
    cleanup();
  };
}

type Stage = Parameters<typeof markStage>[0];

// r12 : « une seule fois par reload » — l'état vit au niveau module, donc il
// se réinitialise à chaque chargement de document et JAMAIS sur un simple
// re-montage de composant ou une navigation client.
const oncePerLoad = new Set<Stage>();

/** Pose la marque UNE seule fois par chargement de document. */
export function markStageOnce(stage: Stage): void {
  if (oncePerLoad.has(stage)) return;
  oncePerLoad.add(stage);
  markStage(stage);
}

/**
 * Pose la marque une seule fois, APRÈS que le commit courant a réellement été
 * peint : double requestAnimationFrame (le 1er court avant la présentation du
 * frame, le 2e garantit qu'un frame est présenté). Sans rAF (tests, workers) :
 * marque immédiate.
 */
export function markStageAfterPaint(stage: Stage): void {
  if (oncePerLoad.has(stage)) return;
  oncePerLoad.add(stage);
  if (typeof requestAnimationFrame !== 'function') {
    markStage(stage);
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => markStage(stage));
  });
}

/** Reset de test uniquement. */
export function __resetPerfStagesOnceForTests(): void {
  oncePerLoad.clear();
}
