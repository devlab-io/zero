import type { QueryClient } from '@tanstack/react-query';

/**
 * Pool de QueryClients par cacheOwner (`userId-connectionId`).
 *
 * L'ancien slot unique jetait le client du compte quitté à chaque switch :
 * admin→Thomas→admin repartait à froid. Retenir chaque client garde les caches
 * ISOLÉS (aucune écriture croisée possible : un client par compte) et CHAUDS —
 * le switch retour re-rend instantanément depuis la mémoire, la revalidation
 * réseau suit. La factory est injectée pour rester testable sans le provider.
 */
export function acquireQueryClient(
  cacheOwner: string,
  make: (cacheOwner: string) => QueryClient,
  pool: Map<string, QueryClient>,
): QueryClient {
  const existing = pool.get(cacheOwner);
  if (existing) return existing;
  const created = make(cacheOwner);
  pool.set(cacheOwner, created);
  return created;
}
