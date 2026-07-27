import { ReSummarizeThread, SummarizeMessage, SummarizeThread } from './brain.fallback.prompts';
import { getSubscriptionFactory } from './factories/subscription-factory.registry';
import { AiChatPrompt, StyledEmailAssistantSystemPrompt } from './prompts';
import { resetConnection } from './server-utils';
import { EPrompts, EProviders } from '../types';
import { getPromptName } from './prompt-names';
import { logger } from './logger';
import { env } from '../env';

/**
 * Erreur d'inscription au push, levée quand la factory rapporte un échec au lieu d'en
 * lever un. Elle existe pour qu'un appelant puisse distinguer « le watch n'a pas été
 * reposé » de « autre chose a cassé ».
 */
export class BrainSubscriptionError extends Error {
  constructor(
    readonly connectionId: string,
    readonly status: number,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Failed to subscribe connection ${connectionId} (status ${status}): ${reason}`, options);
    this.name = 'BrainSubscriptionError';
  }
}

/**
 * Repose le watch push du fournisseur pour une connexion, et LÈVE si ce n'est pas fait.
 *
 * Le `catch` précédent journalisait, appelait `resetConnection`, puis se RÉSOLVAIT
 * normalement. Combiné à `GoogleSubscriptionFactory.subscribe`, qui RETOURNAIT un
 * `Response` 500 au lieu de lever, cela rendait tout échec de renouvellement
 * indistinguable d'un succès pour l'appelant — donc le `msg.retry()` du consommateur
 * `subscribe-queue` (lib/subscribe-queue.ts) était du CODE MORT : la fonction qu'il
 * protège ne pouvait pas rejeter. Le watch Gmail expirait à sept jours et la boîte
 * cessait silencieusement de recevoir ses notifications push.
 *
 * `resetConnection` est un effet de nettoyage : son propre échec ne doit pas masquer la
 * cause réelle, qui est celle que l'appelant doit voir.
 */
export const enableBrainFunction = async (connection: { id: string; providerId: EProviders }) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    const result = await subscriptionFactory.subscribe({ body: { connectionId: connection.id } });
    if (!result.ok) {
      throw new BrainSubscriptionError(connection.id, result.status, result.reason, {
        cause: result.cause,
      });
    }
  } catch (error) {
    logger.error(`Failed to enable brain function: ${error}`);
    try {
      await resetConnection(connection.id);
    } catch (resetError) {
      logger.error(
        `Failed to reset connection ${connection.id} after subscribe failure:`,
        resetError,
      );
    }
    throw error;
  }
};

export const disableBrainFunction = async (connection: { id: string; providerId: EProviders }) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    await subscriptionFactory.unsubscribe({
      body: { connectionId: connection.id, providerId: connection.providerId },
    });
  } catch (error) {
    logger.error(`Failed to disable brain function: ${error}`);
  }
};

export const getPrompt = async (promptName: string, fallback: string) => {
  const existingPrompt = await env.prompts_storage.get(promptName);
  if (!existingPrompt || existingPrompt === 'undefined') {
    await env.prompts_storage.put(promptName, fallback);
    return fallback;
  }
  return existingPrompt;
};

export const getPrompts = async ({ connectionId }: { connectionId: string }) => {
  const prompts: Record<EPrompts, string> = {
    [EPrompts.SummarizeMessage]: '',
    [EPrompts.ReSummarizeThread]: '',
    [EPrompts.SummarizeThread]: '',
    [EPrompts.Chat]: '',
    [EPrompts.Compose]: '',
    // [EPrompts.ThreadLabels]: '',
  };
  const fallbackPrompts = {
    [EPrompts.SummarizeMessage]: SummarizeMessage,
    [EPrompts.ReSummarizeThread]: ReSummarizeThread,
    [EPrompts.SummarizeThread]: SummarizeThread,
    [EPrompts.Chat]: AiChatPrompt(),
    [EPrompts.Compose]: StyledEmailAssistantSystemPrompt(),
    // [EPrompts.ThreadLabels]: '',
  };
  for (const promptType of Object.values(EPrompts)) {
    const promptName = getPromptName(connectionId, promptType);
    const prompt = await getPrompt(promptName, fallbackPrompts[promptType]);
    prompts[promptType] = prompt;
  }
  return prompts;
};
