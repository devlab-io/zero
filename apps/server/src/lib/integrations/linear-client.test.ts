import { createLinearClient, LinearApiError } from './linear-client';
import { describe, expect, it, vi } from 'vitest';

/**
 * Matrice de CERTITUDE d'effet (adversarial-11) : seul un refus EXPLICITE
 * sans création est retryable ('proven_failed') ; un 2xx avec erreurs
 * GraphQL ou un JSON ambigu est 'unknown' (effet partiel possible) ; 401 est
 * 'unauthorized' (un refresh unique possible) ; réseau/5xx 'unknown'.
 */

const clientWith = (fetchImpl: unknown) =>
  createLinearClient({ fetchImpl: fetchImpl as typeof fetch, accessToken: 'at' });

const issueInput = { teamId: 'lt-1', title: 'T' };

async function kindOf(fetchImpl: unknown): Promise<string> {
  try {
    await clientWith(fetchImpl).issueCreate(issueInput);
    return 'success';
  } catch (error) {
    if (error instanceof LinearApiError) return error.kind;
    return 'other';
  }
}

describe('LinearApiError — classification par certitude d’effet', () => {
  it('200 + errors GraphQL → unknown (JAMAIS « prouvé sans création »)', async () => {
    expect(
      await kindOf(
        async () =>
          new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 200 }),
      ),
    ).toBe('unknown');
    // data null sans errors : tout aussi ambigu.
    expect(
      await kindOf(async () => new Response(JSON.stringify({ data: null }), { status: 200 })),
    ).toBe('unknown');
    // 200 avec un corps non-JSON : ambigu.
    expect(await kindOf(async () => new Response('pas du json', { status: 200 }))).toBe('unknown');
  });

  it('200 + issueCreate.success:false → proven_failed (refus EXPLICITE, retry sûr)', async () => {
    expect(
      await kindOf(
        async () =>
          new Response(JSON.stringify({ data: { issueCreate: { success: false, issue: null } } }), {
            status: 200,
          }),
      ),
    ).toBe('proven_failed');
  });

  it('4xx → proven_failed (mutation refusée avant exécution) ; 401 → unauthorized', async () => {
    expect(await kindOf(async () => new Response('bad', { status: 400 }))).toBe('proven_failed');
    expect(await kindOf(async () => new Response('forbidden', { status: 403 }))).toBe(
      'proven_failed',
    );
    expect(await kindOf(async () => new Response('nope', { status: 401 }))).toBe('unauthorized');
  });

  it('5xx et échec réseau → unknown (l’issue a PU être créée)', async () => {
    expect(await kindOf(async () => new Response('oops', { status: 500 }))).toBe('unknown');
    expect(await kindOf(async () => new Response('bad gw', { status: 502 }))).toBe('unknown');
    expect(
      await kindOf(async () => {
        throw new TypeError('fetch failed');
      }),
    ).toBe('unknown');
  });

  it('succès nominal : issue retournée', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'i1', identifier: 'ENG-1', url: 'https://linear.app/x' },
              },
            },
          }),
          { status: 200 },
        ),
    );
    await expect(clientWith(fetchImpl).issueCreate(issueInput)).resolves.toMatchObject({
      identifier: 'ENG-1',
    });
  });
});
