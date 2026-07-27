import { defaultLabels, EProviders } from '../../types';

import { connection } from '../../db/schema';

import { withDb } from '../../db';
import { eq } from 'drizzle-orm';
import { env } from '../../env';

export interface SubscriptionData {
  connectionId?: string;
  silent?: boolean;
  force?: boolean;
}

export interface UnsubscriptionData {
  connectionId?: string;
  providerId?: EProviders;
}

/**
 * Issue d'une (ré)inscription au push du fournisseur.
 *
 * `subscribe` retournait un `Response` — y compris `c.json({error:'Internal server
 * error'}, {status:500})` sur échec. Aucun appelant n'est un handler HTTP : le seul est
 * `lib/brain.ts` `enableBrainFunction`, qui IGNORAIT la valeur retournée. Un échec de
 * renouvellement du watch Gmail ressemblait donc trait pour trait à un succès, et le
 * `msg.retry()` du consommateur `subscribe-queue` — écrit exprès pour ce cas — ne pouvait
 * JAMAIS s'exécuter : c'était du code mort. Un résultat typé rend l'échec impossible à
 * confondre avec un succès, et impossible à ignorer sans le dire.
 */
export type SubscriptionResult =
  | { ok: true }
  | { ok: false; status: number; reason: string; cause?: unknown };

export abstract class BaseSubscriptionFactory {
  abstract readonly providerId: EProviders;

  abstract subscribe(data: { body: SubscriptionData }): Promise<SubscriptionResult>;

  abstract unsubscribe(data: { body: UnsubscriptionData }): Promise<Response>;

  abstract verifyToken(token: string): Promise<boolean>;

  protected async getConnectionFromDb(connectionId: string) {
    // `withDb` relâche la connexion dans un `finally` : le `conn.end()` d'origine ne
    // s'exécutait que si la requête aboutissait, alors que ce chemin est celui du
    // renouvellement du watch Gmail — appelé en boucle par la queue `subscribe-queue`,
    // donc celui où une connexion perdue par échec se répétait le plus.
    return withDb(env.HYPERDRIVE.connectionString, (db) =>
      db.query.connection.findFirst({
        where: eq(connection.id, connectionId),
      }),
    );
  }

  protected async initializeConnectionLabels(connectionId: string): Promise<void> {
    const existingLabels = await env.connection_labels.get(connectionId);
    if (!existingLabels?.trim().length) {
      await env.connection_labels.put(connectionId, JSON.stringify(defaultLabels));
    }
  }
}
