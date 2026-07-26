import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * Preuve que `/ai/do/:action` ne court-circuite plus le schéma zod de l'outil.
 *
 * Constat : `tool.execute?.(body || {}, …)` passait le corps JSON TEL QUEL. Le même outil
 * appelé par le modèle est toujours parsé par le SDK ; appelé par cette route, il recevait
 * n'importe quelle forme — y compris des champs absents ou d'un autre type.
 */
const execute = vi.fn(async (input: unknown) => ({ echoed: input }));

const toolset = {
  askZeroMailbox: {
    parameters: z.object({ query: z.string().min(1), limit: z.number().int().optional() }),
    execute,
  },
  noSchema: { execute },
};

vi.mock('../lib/voice-auth', () => ({ isAuthorizedVoiceCaller: () => true }));
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../services/call-service/system-prompt', () => ({ systemPrompt: () => '' }));
vi.mock('../env', () => ({
  env: { DISABLE_CALLS: false, VOICE_SECRET: 's', HYPERDRIVE: { connectionString: 'x' } },
}));
vi.mock('../db', () => ({
  createDb: () => ({
    db: {
      query: {
        user: { findFirst: async () => ({ id: 'u1', defaultConnectionId: 'c1' }) },
        connection: { findFirst: async () => ({ id: 'c1', userId: 'u1' }) },
      },
    },
    conn: { end: async () => {} },
  }),
}));
vi.mock('./agent/tools', () => ({ tools: async () => toolset }));

const { aiRouter } = await import('./ai');

const post = (action: string, body: unknown) =>
  aiRouter.request(`/do/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Voice-Secret': 's', 'X-Caller': '+689' },
    body: JSON.stringify(body),
  });

beforeEach(() => execute.mockClear());

describe('/ai/do/:action — le schéma de l’outil est appliqué', () => {
  it('exécute l’outil avec l’entrée PARSÉE quand elle est valide', async () => {
    const response = await post('askZeroMailbox', { query: 'factures', limit: 3 });

    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ query: 'factures', limit: 3 }, expect.any(Object));
  });

  it('refuse une entrée hors schéma sans jamais exécuter l’outil', async () => {
    const response = await post('askZeroMailbox', { query: 42 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuse un corps vide quand l’outil exige un champ', async () => {
    const response = await post('askZeroMailbox', {});

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('écarte les champs surnuméraires au lieu de les transmettre', async () => {
    await post('askZeroMailbox', { query: 'x', injected: 'payload' });

    expect(execute).toHaveBeenCalledWith({ query: 'x' }, expect.any(Object));
  });

  it('refuse d’exécuter un outil sans schéma déclaré plutôt que de le laisser passer', async () => {
    const response = await post('noSchema', { anything: true });

    expect(response.status).toBe(500);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rend 404 pour un outil inconnu', async () => {
    expect((await post('inexistant', {})).status).toBe(404);
  });
});
