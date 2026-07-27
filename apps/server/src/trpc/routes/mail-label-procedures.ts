// trpc/routes/mail-label-procedures.ts — fabriques de procédures d'étiquetage
// (pitbull A5, axe 2).
//
// `toggleStar` et `toggleImportant` étaient 54 lignes identiques à la constante d'étiquette
// près, et les quatre `bulk{Star,Unstar,MarkImportant,UnmarkImportant}` identiques à
// l'étiquette et au sens près : ~120 lignes de copier-coller dans le fichier le plus chaud
// du serveur, avec le risque classique de corriger un bug dans une copie sur six.
//
// Le comportement est repris tel quel, y compris ses particularités : le préfixe de tag
// comparé est l'étiquette en minuscules (`starred`, `important`), la bascule est décidée à
// l'échelle du lot (si UN fil porte déjà l'étiquette, le lot entier est déséquipé), et le
// lot vide renvoie `{ success: false }` plutôt que de lever.

import { getThread, getZeroAgent, modifyThreadLabelsInDB } from '../../lib/server-utils';
import { getContext } from 'hono/context-storage';
import { activeDriverProcedure } from '../trpc';
import { type HonoContext } from '../../ctx';
import { z } from 'zod';

/** Étiquettes gérées par ces fabriques. */
export type ToggleableLabel = 'STARRED' | 'IMPORTANT';

const idsInput = z.object({ ids: z.string().array() });

/**
 * Bascule d'étiquette sur un lot de fils : lit l'état courant des fils, puis pose
 * l'étiquette sur tout le lot si aucun ne la porte, sinon la retire de tout le lot.
 */
export const makeToggleLabelProcedure = (label: ToggleableLabel) =>
  activeDriverProcedure.input(idsInput).mutation(async ({ input, ctx }) => {
    const { activeConnection } = ctx;
    const executionCtx = getContext<HonoContext>().executionCtx;
    const { stub: agent } = await getZeroAgent(activeConnection.id, executionCtx);
    const { threadIds } = await agent.normalizeIds(input.ids);

    if (!threadIds.length) {
      return { success: false, error: 'No thread IDs provided' };
    }

    const threadResults = await Promise.allSettled(
      threadIds.map(async (id: string) => {
        const thread = await getThread(activeConnection.id, id);
        return thread.result;
      }),
    );

    const tagPrefix = label.toLowerCase();
    let anyLabelled = false;
    let processedThreads = 0;

    for (const result of threadResults) {
      if (result.status === 'fulfilled' && result.value && result.value.messages.length > 0) {
        processedThreads++;
        const isThreadLabelled = result.value.messages.some((message) =>
          message.tags?.some((tag) => tag.name.toLowerCase().startsWith(tagPrefix)),
        );
        if (isThreadLabelled) {
          anyLabelled = true;
          break;
        }
      }
    }

    const shouldLabel = processedThreads > 0 && !anyLabelled;

    await Promise.all(
      threadIds.map((threadId) =>
        modifyThreadLabelsInDB(
          activeConnection.id,
          threadId,
          shouldLabel ? [label] : [],
          shouldLabel ? [] : [label],
        ),
      ),
    );

    return { success: true };
  });

/**
 * Pose (`add`) ou retire (`remove`) inconditionnellement une étiquette sur les identifiants
 * fournis, sans lire l'état courant — c'est l'action de masse déclenchée depuis l'UI.
 */
export const makeBulkLabelProcedure = (label: ToggleableLabel, direction: 'add' | 'remove') =>
  activeDriverProcedure.input(idsInput).mutation(async ({ input, ctx }) => {
    const { activeConnection } = ctx;
    const [added, removed] = direction === 'add' ? [[label], []] : [[], [label]];
    return Promise.all(
      input.ids.map((threadId) =>
        modifyThreadLabelsInDB(activeConnection.id, threadId, added, removed),
      ),
    );
  });
