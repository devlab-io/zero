/**
 * Source de vérité CLIENT de la connexion (compte) active.
 *
 * QueryProvider était monté avec connectionId={null} : le scope de cache
 * `userId-connectionId` valait toujours `user-default` et n'isolait aucun
 * compte — le switch masquait le défaut à coups de clear()/idbClear. Ce store
 * porte le connectionId actif hors React pour que le provider sélectionne un
 * QueryClient et un persister RÉELS par compte, et fournit la fence epoch qui
 * rejette les réponses parties avant un switch et arrivées après.
 */

const ACTIVE_CONNECTION_HINT_KEY = 'zero-active-connection-hint';

type Listener = () => void;

let activeConnectionId: string | null = null;
let epoch = 0;
let hydrated = false;
const listeners = new Set<Listener>();

function hydrateFromStorage() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    activeConnectionId = window.localStorage.getItem(ACTIVE_CONNECTION_HINT_KEY);
  } catch {
    // Navigation privée / quota plein : le hint est un confort de boot,
    // pas une nécessité fonctionnelle.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function getActiveConnectionId(): string | null {
  hydrateFromStorage();
  return activeConnectionId;
}

export function getConnectionEpoch(): number {
  return epoch;
}

/**
 * Change le compte actif. Chaque changement effectif incrémente l'epoch : les
 * réponses réseau émises sous l'ancien epoch sont rejetées à l'atterrissage
 * (voir isStaleConnectionResponse), qu'elles portent les données de l'ancien
 * compte ou celles du nouveau servies trop tôt — un cache par compte ne doit
 * jamais recevoir une réponse qui a traversé un switch.
 */
export function setActiveConnectionId(connectionId: string | null): void {
  hydrateFromStorage();
  if (connectionId === activeConnectionId) return;
  activeConnectionId = connectionId;
  epoch++;
  try {
    if (typeof window !== 'undefined') {
      if (connectionId) window.localStorage.setItem(ACTIVE_CONNECTION_HINT_KEY, connectionId);
      else window.localStorage.removeItem(ACTIVE_CONNECTION_HINT_KEY);
    }
  } catch {
    // idem
  }
  notify();
}

export function subscribeActiveConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fence pure : une réponse émise sous un epoch différent de l'epoch courant est périmée. */
export function isStaleConnectionResponse(issuedEpoch: number, currentEpoch: number): boolean {
  return issuedEpoch !== currentEpoch;
}

export class StaleConnectionResponseError extends Error {
  constructor() {
    super('Response crossed an account switch and was rejected');
    this.name = 'StaleConnectionResponseError';
  }
}

/** Reset de test uniquement. */
export function __resetActiveConnectionStoreForTests(): void {
  activeConnectionId = null;
  epoch = 0;
  hydrated = false;
  listeners.clear();
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACTIVE_CONNECTION_HINT_KEY);
    }
  } catch {
    // environnement sans storage
  }
}
