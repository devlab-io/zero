// shard-registry.test.ts — le VRAI Durable Object, sur un vrai moteur SQLite.
//
// Réfutation (b) de l'audit : « la réservation d'envoi posée sur KV n'est PAS atomique —
// deux livraisons concurrentes produisent deux envois ». La preuve attendue n'est donc pas
// qu'une décision pure dit « skip » quand on lui présente une ligne fabriquée à la main :
// c'est que DEUX LIVRAISONS CONCURRENTES du même messageId, passant par le chemin de
// production, produisent UN SEUL envoi.
//
// Ce fichier instancie la classe `ShardRegistry` telle qu'elle est déployée — décorateurs
// `@Migratable`/`@Queryable` compris, donc migrations réellement appliquées — sur un
// `SqlStorage` adossé à `node:sqlite`. Rien du comportement testé n'est simulé : la
// primary key, le `ON CONFLICT ... WHERE` et `rowsWritten` sont ceux de SQLite.

import type { SendReservationRpcResult, SettledSendOutcome } from '../../lib/send-reservation';
import { deliverScheduledEmail, type ScheduledSendStore } from '../../lib/scheduled-send';
import { createDurableObjectCtx } from '../../../tests/stubs/sqlite-sql-storage';
import { describe, expect, it, vi } from 'vitest';
import { ShardRegistry } from './shard-registry';

type RegistryLike = {
  reserveScheduledSend(messageId: string, now: number): Promise<SendReservationRpcResult>;
  settleScheduledSend(
    messageId: string,
    outcome: SettledSendOutcome,
    now: number,
    detail?: string,
  ): Promise<void>;
  getScheduledSendReservation(messageId: string): Promise<{
    status: string;
    outcome: string | null;
    reservedAt: number | null;
    settledAt: number | null;
    detail: string | null;
  } | null>;
};

function makeRegistry(): RegistryLike {
  const { ctx } = createDurableObjectCtx();
  // Le constructeur du décorateur `@Migratable` exécute les migrations 1..3 sur ce
  // stockage : si la table `scheduled_send_reservations` n'était pas créée, tout ce
  // fichier échouerait ici.
  return new ShardRegistry(
    ctx as unknown as DurableObjectState,
    {} as never,
  ) as unknown as RegistryLike;
}

function makeStore(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    put: async (k: string, v: string) => void map.set(k, v),
    delete: async (k: string) => void map.delete(k),
  } satisfies ScheduledSendStore & { map: Map<string, string> };
}

const silentLogger = { info: vi.fn(), error: vi.fn() };

const BODY = { to: [{ email: 'x@y.co' }], subject: 'S', message: 'M', headers: {} };

describe('ShardRegistry — migrations', () => {
  it('applique la migration 3 : la table des réservations existe', async () => {
    const registry = makeRegistry();
    // Une lecture sur une table absente lèverait « no such table ».
    await expect(registry.getScheduledSendReservation('nobody')).resolves.toBeNull();
  });
});

describe('ShardRegistry.reserveScheduledSend — exclusion mutuelle (réfutation b)', () => {
  it('la première réservation gagne, la seconde est refusée « in-flight »', async () => {
    const registry = makeRegistry();
    const first = await registry.reserveScheduledSend('m1', 1_000);
    const second = await registry.reserveScheduledSend('m1', 1_001);

    expect(first).toEqual({ action: 'reserve', reason: 'first-arrival' });
    expect(second).toEqual({ action: 'skip', reason: 'in-flight' });
  });

  it('DEUX RÉSERVATIONS LANCÉES ENSEMBLE : une seule passe', async () => {
    const registry = makeRegistry();
    const [a, b] = await Promise.all([
      registry.reserveScheduledSend('race', 5_000),
      registry.reserveScheduledSend('race', 5_000),
    ]);
    const reserved = [a, b].filter((r) => r.action === 'reserve');
    expect(reserved).toHaveLength(1);
  });

  it('vingt réservations concurrentes : exactement une gagne', async () => {
    const registry = makeRegistry();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => registry.reserveScheduledSend('storm', 9_000)),
    );
    expect(results.filter((r) => r.action === 'reserve')).toHaveLength(1);
    expect(results.filter((r) => r.action === 'skip')).toHaveLength(19);
  });

  it('une réservation `sending` n’est JAMAIS reprise, quel que soit son âge', async () => {
    const registry = makeRegistry();
    await registry.reserveScheduledSend('stuck', 0);
    // Un an plus tard : contrairement au verrou d'historique, aucune péremption. Reprendre
    // reviendrait à renvoyer un mail dont l'issue est inconnue.
    const later = await registry.reserveScheduledSend('stuck', 365 * 24 * 3600 * 1000);
    expect(later).toEqual({ action: 'skip', reason: 'in-flight' });
  });

  it('un envoi réglé `sent` refuse toute nouvelle réservation', async () => {
    const registry = makeRegistry();
    await registry.reserveScheduledSend('done', 1);
    await registry.settleScheduledSend('done', 'sent', 2, 'ok');
    expect(await registry.reserveScheduledSend('done', 3)).toEqual({
      action: 'skip',
      reason: 'already-sent',
    });
  });

  it('une issue AMBIGUË ferme le message : jamais de rejeu', async () => {
    const registry = makeRegistry();
    await registry.reserveScheduledSend('maybe', 1);
    await registry.settleScheduledSend('maybe', 'unresolved', 2, 'transport-failure');
    expect(await registry.reserveScheduledSend('maybe', 3)).toEqual({
      action: 'skip',
      reason: 'unresolved-outcome',
    });
  });

  it('une non-acceptation PROUVÉE rouvre le message', async () => {
    const registry = makeRegistry();
    await registry.reserveScheduledSend('nope', 1);
    await registry.settleScheduledSend('nope', 'failed', 2, 'http-429');
    expect(await registry.reserveScheduledSend('nope', 3)).toEqual({
      action: 'reserve',
      reason: 'retry-after-proven-failure',
    });
  });

  it('le motif d’échec est conservé et lisible', async () => {
    const registry = makeRegistry();
    await registry.reserveScheduledSend('traced', 1);
    await registry.settleScheduledSend('traced', 'unresolved', 42, 'http-503');
    const row = await registry.getScheduledSendReservation('traced');
    expect(row).toMatchObject({
      status: 'settled',
      outcome: 'unresolved',
      settledAt: 42,
      detail: 'http-503',
    });
  });

  it('l’écriture est un COMPARE-AND-SET réel, pas une écriture aveugle', async () => {
    // La garantie ne repose pas seulement sur la sérialisation des invocations d'un DO :
    // la clause `WHERE` de `ON CONFLICT DO UPDATE` n'autorise l'écrasement que d'une
    // réservation réglée `failed`. Ce test l'exerce directement sur le moteur, avec la
    // requête de production, pour montrer qu'un perdant de course écrirait 0 ligne.
    const { ctx, storage } = createDurableObjectCtx();
    new ShardRegistry(ctx as unknown as DurableObjectState, {} as never);

    const cas = (messageId: string, now: number) => {
      const cursor = storage.sql.exec(
        `INSERT INTO scheduled_send_reservations (message_id, status, outcome, reserved_at, settled_at, detail)
         VALUES (?, 'sending', NULL, ?, NULL, NULL)
         ON CONFLICT(message_id) DO UPDATE SET
           status = 'sending', outcome = NULL, reserved_at = excluded.reserved_at,
           settled_at = NULL, detail = NULL
         WHERE scheduled_send_reservations.status = 'settled'
           AND scheduled_send_reservations.outcome = 'failed'`,
        messageId,
        now,
      );
      cursor.toArray();
      return cursor.rowsWritten;
    };

    expect(cas('cas', 1)).toBe(1); // première pose
    expect(cas('cas', 2)).toBe(0); // déjà `sending` : refusé par la clause WHERE

    storage.sql.exec(
      `UPDATE scheduled_send_reservations SET status='settled', outcome='sent' WHERE message_id='cas'`,
    );
    expect(cas('cas', 3)).toBe(0); // déjà parti : refusé

    storage.sql.exec(
      `UPDATE scheduled_send_reservations SET status='settled', outcome='unresolved' WHERE message_id='cas'`,
    );
    expect(cas('cas', 4)).toBe(0); // issue ambiguë : refusé

    storage.sql.exec(
      `UPDATE scheduled_send_reservations SET status='settled', outcome='failed' WHERE message_id='cas'`,
    );
    expect(cas('cas', 5)).toBe(1); // non-acceptation prouvée : seule reprise autorisée
  });

  it('deux messageId distincts ne se bloquent pas', async () => {
    const registry = makeRegistry();
    expect((await registry.reserveScheduledSend('a', 1)).action).toBe('reserve');
    expect((await registry.reserveScheduledSend('b', 1)).action).toBe('reserve');
  });
});

// ---------------------------------------------------------------------------
// Le chemin de production complet : deliverScheduledEmail + le vrai DO.
// ---------------------------------------------------------------------------

describe('deliverScheduledEmail × ShardRegistry — un seul envoi réel (réfutation b)', () => {
  /** Branchement identique à celui de main.ts (`createSendReservationGate`). */
  const gateFor = (registry: RegistryLike) => ({
    reserve: (messageId: string, now: number) => registry.reserveScheduledSend(messageId, now),
    settle: (messageId: string, outcome: SettledSendOutcome, now: number, detail?: string) =>
      registry.settleScheduledSend(messageId, outcome, now, detail),
  });

  it('DEUX LIVRAISONS CONCURRENTES du même message : le driver n’est appelé QU’UNE FOIS', async () => {
    const registry = makeRegistry();
    const statusKV = makeStore({ 'msg-race': 'pending' });
    const payloadKV = makeStore({ 'msg-race': JSON.stringify(BODY) });

    // L'envoi est lent : les deux livraisons sont réellement en vol en même temps. C'est
    // exactement la fenêtre que la paire KV `get`/`put` laissait ouverte.
    const send = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const deps = {
      statusKV,
      payloadKV,
      reservation: gateFor(registry),
      send,
      logger: silentLogger,
    };

    const [first, second] = await Promise.all([
      deliverScheduledEmail({ messageId: 'msg-race', connectionId: 'c' }, deps),
      deliverScheduledEmail({ messageId: 'msg-race', connectionId: 'c' }, deps),
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['sent', 'skipped']);
    expect(await registry.getScheduledSendReservation('msg-race')).toMatchObject({
      status: 'settled',
      outcome: 'sent',
    });
  });

  it('la course tient même quand le pré-filtre KV ne voit RIEN (KV en retard)', async () => {
    const registry = makeRegistry();
    // KV éventuellement cohérent : toutes les lectures d'état renvoient `null`, comme sur
    // huit edges distincts qui n'ont pas encore vu l'écriture des autres. La seule
    // barrière restante est la réservation du DO.
    const statusKV = makeStore();
    const observedStatuses: (string | null)[] = [];
    const eventuallyConsistentStatusKV: ScheduledSendStore = {
      get: async (k) => {
        const value = await statusKV.get(k);
        observedStatuses.push(value);
        return value;
      },
      put: statusKV.put,
      delete: statusKV.delete,
    };
    const payloadKV = makeStore({ 'msg-eventual': JSON.stringify(BODY) });
    const send = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const deps = {
      statusKV: eventuallyConsistentStatusKV,
      payloadKV,
      reservation: gateFor(registry),
      send,
      logger: silentLogger,
    };

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        deliverScheduledEmail({ messageId: 'msg-eventual', connectionId: 'c' }, deps),
      ),
    );

    // Le point du test : AUCUNE des huit livraisons n'a lu un statut bloquant dans KV.
    // L'exclusion ne peut donc pas venir du pré-filtre KV — elle vient de la réservation.
    expect(observedStatuses).toHaveLength(8);
    expect(observedStatuses.every((s) => s === null)).toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.outcome === 'sent')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'skipped')).toHaveLength(7);
  });

  it('une redélivrance après succès n’envoie pas une seconde fois, même avec un KV vidé', async () => {
    const registry = makeRegistry();
    const statusKV = makeStore({ 'msg-later': 'pending' });
    const payloadKV = makeStore({ 'msg-later': JSON.stringify(BODY) });
    const send = vi.fn(async () => {});
    const deps = {
      statusKV,
      payloadKV,
      reservation: gateFor(registry),
      send,
      logger: silentLogger,
    };

    expect(
      await deliverScheduledEmail({ messageId: 'msg-later', connectionId: 'c' }, deps),
    ).toEqual({
      outcome: 'sent',
    });

    // La marque KV expire (TTL) ; le corps est encore là parce qu'on rejoue le scénario.
    statusKV.map.delete('msg-later');
    payloadKV.map.set('msg-later', JSON.stringify(BODY));

    const second = await deliverScheduledEmail({ messageId: 'msg-later', connectionId: 'c' }, deps);
    expect(second).toEqual({ outcome: 'skipped', status: 'already-sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('après une issue AMBIGUË, aucune livraison ultérieure ne renvoie', async () => {
    const registry = makeRegistry();
    const statusKV = makeStore({ 'msg-amb': 'pending' });
    const payloadKV = makeStore({ 'msg-amb': JSON.stringify(BODY) });
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(undefined);
    const retry = vi.fn();
    const deps = {
      statusKV,
      payloadKV,
      reservation: gateFor(registry),
      send,
      retry,
      logger: silentLogger,
    };

    const first = await deliverScheduledEmail({ messageId: 'msg-amb', connectionId: 'c' }, deps);
    expect(first.outcome).toBe('unresolved');
    expect(retry).not.toHaveBeenCalled();

    // Redélivrance forcée (la queue peut toujours en produire une) : le DO la refuse.
    statusKV.map.delete('msg-amb');
    const second = await deliverScheduledEmail({ messageId: 'msg-amb', connectionId: 'c' }, deps);
    expect(second).toEqual({ outcome: 'skipped', status: 'unresolved-outcome' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('un refus PROUVÉ et transitoire (429) rouvre le message : le second essai part', async () => {
    const registry = makeRegistry();
    const statusKV = makeStore({ 'msg-429': 'pending' });
    const payloadKV = makeStore({ 'msg-429': JSON.stringify(BODY) });
    const rateLimited = Object.assign(new Error('rate limited'), { code: 429 });
    const send = vi.fn().mockRejectedValueOnce(rateLimited).mockResolvedValue(undefined);
    const retry = vi.fn();
    const deps = {
      statusKV,
      payloadKV,
      reservation: gateFor(registry),
      send,
      retry,
      logger: silentLogger,
    };

    const first = await deliverScheduledEmail({ messageId: 'msg-429', connectionId: 'c' }, deps);
    expect(first).toMatchObject({ outcome: 'failed', retried: true });
    expect(retry).toHaveBeenCalledTimes(1);

    const second = await deliverScheduledEmail({ messageId: 'msg-429', connectionId: 'c' }, deps);
    expect(second).toEqual({ outcome: 'sent' });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
