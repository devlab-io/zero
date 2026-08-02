import type { DraftReadEffects } from './team-drafts-store';
import { getZeroAgent } from '../server-utils';

/**
 * Effets RÉELS de lecture de brouillon (P15) — la connexion est TOUJOURS
 * celle du partageur, résolue serveur depuis team_thread ; le client ne
 * fournit jamais de connectionId. Une lecture échouée rend null (le store la
 * traduit en not_found), jamais une exception qui fuirait des détails boîte.
 */
export function draftReadEffects(): DraftReadEffects {
  return {
    getDraft: async (connectionId, draftId) => {
      try {
        const { stub } = await getZeroAgent(connectionId);
        const draft = (await stub.getDraft(draftId)) as {
          subject?: string | null;
          content?: string | null;
          to?: string[] | null;
          cc?: string[] | null;
          bcc?: string[] | null;
        } | null;
        return draft ?? null;
      } catch {
        return null;
      }
    },
  };
}
