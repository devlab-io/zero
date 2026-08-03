/**
 * Runner PROD du sweep de rétention (P17-C) — appelé par le handler
 * `scheduled` de main.ts, ISOLÉ des autres tâches (run-scheduled-tasks).
 * Ouvre Hyperdrive, purge par lots bornés selon les politiques d'équipe,
 * audite chaque purge (actor system). Aucune exception ne remonte au cron.
 */
import { sweepTeamRetention } from './team-governance-store';
import type { ZeroEnv } from '../../env';
import { createDb } from '../../db';
import { logger } from '../logger';

export async function runTeamRetentionSweep(env: ZeroEnv): Promise<void> {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const summary = await sweepTeamRetention(db, new Date());
    if (summary.audit + summary.ruleRuns + summary.notifications + summary.replyIntents > 0) {
      logger.info('[TEAM_RETENTION] swept', summary);
    }
    if (summary.truncated) {
      // Lot plein = reliquat : le prochain run continue — jamais silencieux.
      logger.info('[TEAM_RETENTION] batch full, remainder deferred to next run');
    }
  } catch (error) {
    logger.error('[TEAM_RETENTION] sweep failed', error);
  } finally {
    await conn.end({ timeout: 2 }).catch(() => {});
  }
}
