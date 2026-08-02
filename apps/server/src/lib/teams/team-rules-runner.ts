import { executeRulesForIncomingThread, type RuleMailboxEffects } from './team-rules-store';
import type { IGetThreadResponse } from '../driver/types';
import { modifyThreadLabelsInDB } from '../server-utils';
import { createDb } from '../../db';
import { env } from '../../env';

/** Effets boîte réels du worker — partagés entre ingestion et undo. */
export function ruleMailboxEffects(): RuleMailboxEffects {
  return {
    snoozePut: (key, wakeAtIso) =>
      env.snoozed_emails.put(key, wakeAtIso, { metadata: { wakeAt: wakeAtIso } }),
    snoozeGet: (key) => env.snoozed_emails.get(key),
    snoozeDelete: (key) => env.snoozed_emails.delete(key),
    modifyMailboxLabels: modifyThreadLabelsInDB,
  };
}

/**
 * Pont pipeline → règles d'équipe (P14). Appelé par le workflow automatique
 * d'arrivée de message avec les effets RÉELS du worker : Postgres via
 * Hyperdrive (connexion propre, fermée systématiquement), KV snooze et labels
 * de boîte via server-utils — mêmes chemins que les routes mail.
 */
export async function applyTeamRulesForContext(input: {
  connectionId: string;
  threadId: string;
  thread: IGetThreadResponse;
}) {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  try {
    return await executeRulesForIncomingThread(db, ruleMailboxEffects(), input);
  } finally {
    await conn.end();
  }
}
