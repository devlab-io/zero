// lib/subscribe-queue.ts — renouvellement du watch Gmail (consommateur `subscribe-queue`).
//
// Le cron de main.ts repère les abonnements Gmail de plus de 5 jours (le watch expire à 7)
// et pousse un message par connexion sur `subscribe-queue`. Le consommateur journalisait
// l'échec de `enableBrainFunction` puis ne faisait RIEN : pas de `msg.retry?.()`,
// contrairement aux consommateurs `send-email-queue` et `thread-queue`. Le message était
// acquitté, le watch n'était jamais renouvelé, et la boîte cessait silencieusement de
// recevoir les notifications push — panne invisible côté serveur comme côté utilisateur.
//
// Ce rejeu a ensuite été RÉFUTÉ comme du code mort, et il l'était : `deps.enable` reçoit
// `lib/brain.ts` `enableBrainFunction`, qui enveloppait tout dans son propre try/catch —
// log, `resetConnection`, puis résolution normale, jamais de rethrow —, et en amont
// `GoogleSubscriptionFactory.subscribe()` RETOURNAIT `c.json({error:'Internal server
// error'}, {status:500})` au lieu de lever. La branche `catch` ci-dessous ne pouvait donc
// jamais être atteinte. Les deux maillons sont réparés (résultat typé côté factory,
// propagation côté brain) ; le chemin complet est exercé par lib/brain.test.ts, qui appelle
// le VRAI `enableBrainFunction` au lieu de fabriquer un `enable` qui jette.
//
// Extrait ici avec ses dépendances injectées pour que le rejeu soit testable sans isolate.

export interface RenewSubscriptionInput {
  connectionId: string;
  providerId: string;
}

export interface RenewSubscriptionDeps {
  /** Repose le watch chez le fournisseur (lib/brain.ts `enableBrainFunction`). */
  enable: (input: { id: string; providerId: string }) => Promise<unknown>;
  /** Redemande une livraison de ce message par la queue. */
  retry?: () => void;
  logger: {
    error: (message: unknown, ...rest: unknown[]) => void;
  };
}

export type RenewSubscriptionOutcome =
  | { outcome: 'renewed' }
  | { outcome: 'retried'; error: unknown };

/**
 * Renouvelle un abonnement push. Un échec est REJOUÉ : sans cela le watch expirait à
 * l'échéance des 7 jours et la synchronisation par webhook s'arrêtait définitivement.
 */
export async function renewWatchSubscription(
  input: RenewSubscriptionInput,
  deps: RenewSubscriptionDeps,
): Promise<RenewSubscriptionOutcome> {
  try {
    await deps.enable({ id: input.connectionId, providerId: input.providerId });
    return { outcome: 'renewed' };
  } catch (error) {
    deps.logger.error(
      `Failed to enable brain function for connection ${input.connectionId}:`,
      error,
    );
    deps.retry?.();
    return { outcome: 'retried', error };
  }
}
