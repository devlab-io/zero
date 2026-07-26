import { systemPrompt } from '../services/call-service/system-prompt';
import { isAuthorizedVoiceCaller } from '../lib/voice-auth';
import type { tools } from './agent/tools';
import { logger } from '../lib/logger';
import { Tools } from '../types';
import { createDb } from '../db';
import { env } from '../env';
import { Hono } from 'hono';
import { z } from 'zod';

type ToolsReturnType = Awaited<ReturnType<typeof tools>>;

// Résolution de la connexion de l'appelant vocal : la première branche du `or` d'origine
// (`connection.id === user.defaultConnectionId`) n'était PAS cadrée par `userId`. Rien ne
// vérifie à l'écriture qu'un `defaultConnectionId` appartient bien à son porteur ; une valeur
// pointant sur la connexion d'autrui donnait donc à l'appelant les outils de l'agent sur la
// boîte mail d'un autre utilisateur. Les deux branches sont désormais cadrées.
export const aiRouter = new Hono();

aiRouter.get('/', (c) => c.text('Twilio + ElevenLabs + AI Phone System Ready'));

// Pas d'en-têtes CORS ici (pitbull A7, axe 4) : ces routes s'authentifient par un secret
// partagé serveur-à-serveur. Un `Access-Control-Allow-Origin: *` n'y servait aucun appelant
// légitime — un navigateur qui détiendrait ce secret l'aurait déjà divulgué — et exposait la
// surface à n'importe quelle origine.
aiRouter.use('/do/*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  return next();
});

aiRouter.post('/do/:action', async (c) => {
  if (env.DISABLE_CALLS) return c.json({ success: false, error: 'Not implemented' }, 400);
  if (!isAuthorizedVoiceCaller(env.VOICE_SECRET, c.req.header('X-Voice-Secret')))
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  const caller = c.req.header('X-Caller');
  if (!caller) return c.json({ success: false, error: 'Unauthorized' }, 401);
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  const user = await db.query.user.findFirst({
    where: (user, { eq, and }) =>
      and(eq(user.phoneNumber, caller), eq(user.phoneNumberVerified, true)),
  });
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const connection = await db.query.connection.findFirst({
    // Les DEUX branches sont cadrées par `userId` (cf. en-tête du fichier).
    where: (connection, { and, eq, or }) =>
      or(
        and(eq(connection.id, user.defaultConnectionId ?? ''), eq(connection.userId, user.id)),
        eq(connection.userId, user.id),
      ),
  });
  await conn.end();
  if (!connection) return c.json({ success: false, error: 'Unauthorized' }, 401);

  try {
    const action = c.req.param('action') as keyof ToolsReturnType;
    const body = await c.req.json();
    logger.info('[DEBUG] action', action, body);

    // Get all tools for this connection
    const { tools } = await import('./agent/tools');
    const toolset: ToolsReturnType = await tools(connection.id, action === Tools.InboxRag);
    const tool = toolset[action as keyof ToolsReturnType];

    if (!tool) {
      return c.json({ success: false, error: `Tool '${action}' not found` }, 404);
    }

    const result = await tool.execute?.(body || {}, {
      toolCallId: crypto.randomUUID(),
      messages: [],
    });
    return c.json({ success: true, result });
  } catch (error) {
    logger.error(`Error executing tool '${c.req.param('action')}':`, error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});

aiRouter.post('/call', async (c) => {
  logger.info('[DEBUG] Received call request');

  if (env.DISABLE_CALLS) {
    logger.info('[DEBUG] Calls are disabled');
    return c.json({ success: false, error: 'Not implemented' }, 400);
  }

  if (!isAuthorizedVoiceCaller(env.VOICE_SECRET, c.req.header('X-Voice-Secret'))) {
    logger.info('[DEBUG] Invalid voice secret');
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const caller = c.req.header('X-Caller');
  if (!caller) {
    logger.info('[DEBUG] Missing caller header');
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  logger.info('[DEBUG] Parsing request body');
  const { success, data } = await z
    .object({
      query: z.string(),
    })
    .safeParseAsync(await c.req.json());

  if (!success) {
    logger.info('[DEBUG] Invalid request body');
    return c.json({ success: false, error: 'Invalid request' }, 400);
  }

  logger.info('[DEBUG] Connecting to database');
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);

  logger.info('[DEBUG] Finding user by phone number:', c.req.header('X-Caller'));
  const user = await db.query.user.findFirst({
    where: (user, { eq, and }) =>
      and(eq(user.phoneNumber, caller), eq(user.phoneNumberVerified, true)),
  });

  if (!user) {
    logger.info('[DEBUG] User not found or not verified');
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  logger.info('[DEBUG] Finding connection for user:', user.id);
  const connection = await db.query.connection.findFirst({
    // Les DEUX branches sont cadrées par `userId` (cf. en-tête du fichier).
    where: (connection, { and, eq, or }) =>
      or(
        and(eq(connection.id, user.defaultConnectionId ?? ''), eq(connection.userId, user.id)),
        eq(connection.userId, user.id),
      ),
  });

  await conn.end();

  if (!connection) {
    logger.info('[DEBUG] No connection found for user');
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  logger.info('[DEBUG] Creating toolset for connection:', connection.id);
  const [{ tools }, { generateText }, { openai }] = await Promise.all([
    import('./agent/tools'),
    import('ai'),
    import('@ai-sdk/openai'),
  ]);
  const toolset = await tools(connection.id);
  const { text } = await generateText({
    model: openai(env.OPENAI_MODEL || 'gpt-4o'),
    system: systemPrompt,
    prompt: data.query,
    tools: toolset,
    maxSteps: 10,
  });

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain' },
  });
});
