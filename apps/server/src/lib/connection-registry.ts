/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// lib/connection-registry.ts — accès au Durable Object ShardRegistry d'une connexion.
//
// Une instance par connexion, jamais shardée ni recréée (contrairement à ZeroDriver) :
// c'est le porteur des états qui doivent être ATOMIQUES et durables pour une boîte —
// verrou d'idempotence du webhook Gmail, curseur historyId, et désormais réservation
// d'envoi différé. La dérivation de l'identifiant vivait en dur dans pipelines.ts ; elle
// est centralisée ici parce qu'une seconde formule d'identifiant, quelque part, voudrait
// dire un second DO, donc plus aucune exclusion mutuelle.

import type { SendReservationGate } from './scheduled-send';
import type { ZeroEnv } from '../env';

/** Identifiant du registre d'une connexion. Une seule formule, ici et nulle part ailleurs. */
export const connectionRegistryName = (connectionId: string) =>
  `connection:${connectionId}:registry`;

export const getConnectionRegistry = (env: ZeroEnv, connectionId: string) =>
  env.SHARD_REGISTRY.get(env.SHARD_REGISTRY.idFromName(connectionRegistryName(connectionId)));

/**
 * Verrou d'envoi adossé au registre de la connexion. C'est le branchement de production de
 * `deliverScheduledEmail` : la réservation qu'il pose est une écriture SQL transactionnelle
 * dans un DO unique, là où la paire `get`/`put` sur KV qu'il remplace n'offrait ni
 * compare-and-set ni cohérence immédiate.
 */
export function createSendReservationGate(env: ZeroEnv, connectionId: string): SendReservationGate {
  const registry = getConnectionRegistry(env, connectionId);
  return {
    reserve: (messageId, now) => registry.reserveScheduledSend(messageId, now),
    settle: (messageId, outcome, now, detail) =>
      registry.settleScheduledSend(messageId, outcome, now, detail),
  };
}
