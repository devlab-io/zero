// lib/connection-context.ts — accès à la connexion active et au DO base de données
// (pitbull A4, axe 1).
//
// Ces deux fonctions vivaient dans lib/server-utils.ts, qui importe `createDriver` depuis
// lib/driver/index.ts ; or lib/driver/utils.ts les réimportait depuis server-utils. D'où un
// cycle d'imports de VALEUR (pas de type) entre deux modules cœur du serveur :
//   server-utils → driver/index → driver/{google,microsoft} → driver/utils → server-utils
// Les isoler dans ce module feuille — qui ne dépend que de l'environnement, du contexte Hono
// et du logger, jamais du driver — casse le cycle sans déplacer un octet de logique.
// server-utils les réexporte, les 20 appelants existants sont donc inchangés.

import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../ctx';
import { logger } from './logger';
import { env } from '../env';

export const getZeroDB = async (userId: string) => {
  const stub = env.ZERO_DB.get(env.ZERO_DB.idFromName(userId));
  const rpcTarget = await stub.setMetaData(userId);
  return rpcTarget;
};

export const getActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const { sessionUser, auth } = c.var;
  if (!sessionUser) throw new Error('Session Not Found');

  // Un seul RPC : la logique défaut-sinon-première vit dans le DO ZeroDB, qui
  // mémorise le résultat en local (invalidé par ses propres écritures).
  const stub = env.ZERO_DB.get(env.ZERO_DB.idFromName(sessionUser.id));
  const activeConnection = await stub.getActiveConnection(sessionUser.id);
  if (activeConnection) return activeConnection;

  try {
    if (auth) {
      await auth.api.revokeSession({ headers: c.req.raw.headers });
      await auth.api.signOut({ headers: c.req.raw.headers });
    }
  } catch (err) {
    logger.warn(`[getActiveConnection] Session cleanup failed for user ${sessionUser.id}:`, err);
  }
  logger.error(`No connections found for user ${sessionUser.id}`);
  throw new Error('No connections found for user');
};
