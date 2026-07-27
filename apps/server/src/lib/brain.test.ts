// brain.test.ts — le renouvellement du watch Gmail, sur le VRAI chemin.
//
// Réfutation (a) de l'audit : « le `msg.retry()` ajouté à subscribe-queue.ts est du CODE
// MORT : la fonction qu'il protège ne lève jamais ». Le test qui prétendait le couvrir
// injectait un `enable` qui jetait — il vérifiait donc que `renewWatchSubscription` sait
// attraper une exception qu'on lui fabrique, pas que la production en produit une.
//
// Ici on appelle le VRAI `enableBrainFunction`, avec le VRAI registre de factories, et on
// exige le rejeu. La chaîne exercée est celle de main.ts :
//
//   renewWatchSubscription  ->  enableBrainFunction  ->  getSubscriptionFactory
//                                                    ->  factory.subscribe()
//
// Trois maillons devaient être réparés pour que l'échec arrive jusqu'au `retry` :
// `GoogleSubscriptionFactory.subscribe` RETOURNAIT un `Response` 500 au lieu de lever ;
// `enableBrainFunction` avalait tout dans son propre try/catch et se résolvait normalement ;
// `renewWatchSubscription` ne rejouait que sur rejet. Un seul maillon rompu et le rejeu
// redevient inatteignable — c'est pourquoi le test part du bout de la chaîne.

import {
  getAllRegisteredProviders,
  getSubscriptionFactory,
} from './factories/subscription-factory.registry';
import { BrainSubscriptionError, enableBrainFunction } from './brain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renewWatchSubscription } from './subscribe-queue';
import { EProviders } from '../types';

vi.mock('./server-utils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./server-utils');
  return {
    ...actual,
    // `resetConnection` est un effet de nettoyage sur la base : il n'est pas le sujet, et
    // son propre échec ne doit pas masquer la cause. Neutralisé pour que le test observe
    // exactement l'erreur d'inscription.
    resetConnection: vi.fn(async () => {}),
  };
});

const silentLogger = { error: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('le registre de factories est bien celui de la production', () => {
  it('expose Google, et sa factory porte `subscribe`', () => {
    expect(getAllRegisteredProviders()).toContain(EProviders.google);
    const factory = getSubscriptionFactory(EProviders.google);
    expect(typeof factory.subscribe).toBe('function');
  });
});

describe('enableBrainFunction — un échec d’inscription REMONTE (réfutation a)', () => {
  it('une factory en panne fait REJETER enableBrainFunction', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    // La factory réelle, mise en panne comme elle l'est en production quand la base ou
    // l'API Google est indisponible. Ce n'est pas `enable` qu'on jette : c'est la
    // dépendance externe de la factory qui tombe, et on exige que l'échec traverse.
    vi.spyOn(factory, 'subscribe').mockRejectedValue(new Error('hyperdrive unreachable'));

    await expect(
      enableBrainFunction({ id: 'conn-1', providerId: EProviders.google }),
    ).rejects.toThrow('hyperdrive unreachable');
  });

  it('un ÉCHEC RAPPORTÉ (et non levé) par la factory rejette aussi', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    // Le cas exact du défaut : `subscribe` retournait `c.json({error:'Internal server
    // error'}, {status:500})`. Une valeur retournée, donc un succès du point de vue de
    // l'appelant, donc aucun rejeu possible. Elle est désormais typée `{ok:false}`.
    vi.spyOn(factory, 'subscribe').mockResolvedValue({
      ok: false,
      status: 500,
      reason: 'Internal server error',
    });

    await expect(
      enableBrainFunction({ id: 'conn-2', providerId: EProviders.google }),
    ).rejects.toBeInstanceOf(BrainSubscriptionError);
  });

  it('un `connectionId` manquant est un échec, pas un succès silencieux', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    vi.spyOn(factory, 'subscribe').mockResolvedValue({
      ok: false,
      status: 400,
      reason: 'connection not found',
    });
    await expect(
      enableBrainFunction({ id: 'conn-3', providerId: EProviders.google }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('un fournisseur non enregistré rejette au lieu d’être avalé', async () => {
    await expect(
      enableBrainFunction({ id: 'conn-4', providerId: 'nope' as EProviders }),
    ).rejects.toThrow(/No subscription factory registered/);
  });

  it('une inscription réussie ne rejette pas', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    vi.spyOn(factory, 'subscribe').mockResolvedValue({ ok: true });
    await expect(
      enableBrainFunction({ id: 'conn-5', providerId: EProviders.google }),
    ).resolves.toBeUndefined();
  });
});

describe('chaîne complète subscribe-queue — le rejeu n’est plus du code mort', () => {
  /** Branchement identique à main.ts, `case batch.queue.startsWith('subscribe-queue')`. */
  const runQueueHandler = (connectionId: string, retry: () => void) =>
    renewWatchSubscription(
      { connectionId, providerId: EProviders.google },
      {
        enable: ({ id, providerId }) =>
          enableBrainFunction({ id, providerId: providerId as EProviders }),
        retry,
        logger: silentLogger,
      },
    );

  it('une factory en panne fait REJOUER le message de queue', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    vi.spyOn(factory, 'subscribe').mockRejectedValue(new Error('gmail watch 503'));
    const retry = vi.fn();

    const out = await runQueueHandler('conn-a', retry);

    expect(out).toMatchObject({ outcome: 'retried' });
    // C'est LA ligne que l'audit a déclarée morte : avant correction, `enableBrainFunction`
    // se résolvait toujours, donc `retry` n'était jamais atteint et le watch expirait à
    // sept jours sans que rien ne le signale.
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('un 500 RAPPORTÉ par la factory fait rejouer, comme un rejet', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    vi.spyOn(factory, 'subscribe').mockResolvedValue({
      ok: false,
      status: 500,
      reason: 'Internal server error',
    });
    const retry = vi.fn();

    expect(await runQueueHandler('conn-b', retry)).toMatchObject({ outcome: 'retried' });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('SANS AUCUN DOUBLE : la vraie factory Google en panne fait rejouer', async () => {
    // Aucun espion, aucune erreur fabriquée. `GoogleSubscriptionFactory.subscribe` est
    // exécutée telle quelle et échoue pour la raison la plus banale de la production :
    // la connexion à la base est indisponible (`env.HYPERDRIVE` absent). Avant correction,
    // cette branche retournait `c.json({error:'Internal server error'}, {status:500})` —
    // une VALEUR — que `enableBrainFunction` jetait, et le message de queue était acquitté.
    const retry = vi.fn();

    const out = await runQueueHandler('conn-real', retry);

    expect(out).toMatchObject({ outcome: 'retried' });
    expect(retry).toHaveBeenCalledTimes(1);
    expect((out as { error: unknown }).error).toBeInstanceOf(BrainSubscriptionError);
  });

  it('un renouvellement réussi n’entraîne AUCUN rejeu', async () => {
    const factory = getSubscriptionFactory(EProviders.google);
    const subscribe = vi.spyOn(factory, 'subscribe').mockResolvedValue({ ok: true });
    const retry = vi.fn();

    expect(await runQueueHandler('conn-c', retry)).toEqual({ outcome: 'renewed' });
    expect(retry).not.toHaveBeenCalled();
    // Et la connexion demandée est bien celle transmise par le cron.
    expect(subscribe).toHaveBeenCalledWith({ body: { connectionId: 'conn-c' } });
  });
});
