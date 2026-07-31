import {
  __getSessionTransportForTests as dedupedFetch,
  invalidateGetSessionDedup,
} from './auth-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionPrime } from './session-prime';

// r9b : course P0 du transport get-session. Après un logout (invalidation),
// le then/finally d'une requête encore en vol pouvait recacher l'ANCIENNE
// session et déloger l'in-flight de la requête suivante — fenêtre élargie par
// l'amorce HTML r9. L'époque monotone rend toute requête pré-invalidation
// sans effet observable. Tests sur la VRAIE couture transport exportée.

const URL_A = 'https://api.example.com/api/auth/get-session';

type Deferred = { resolve: (response: Response) => void };
let deferreds: Deferred[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  deferreds = [];
  fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        deferreds.push({ resolve });
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  // Réinitialise l'état module (cache/in-flight/époque avancée + amorce purgée).
  invalidateGetSessionDedup();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionPrime();
});

describe('transport get-session — époque anti-course (r9b)', () => {
  it('A en vol → logout → B démarre → A résout : A ne remplit jamais le cache et ne clobber jamais B', async () => {
    const a = dedupedFetch(URL_A); // requête A (ancienne session)
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateGetSessionDedup(); // logout : époque avancée, références vidées

    const b = dedupedFetch(URL_A); // requête B (nouvelle session) démarre
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A se résout MAINTENANT, après le logout, avec l'ancienne session.
    deferreds[0].resolve(new Response('old-session'));
    await a; // son appelant d'origine la reçoit — mais sans effet partagé

    // Un appel pendant que B est en vol REJOINT B (pas de 3e réseau) : le
    // finally de A n'a pas délogé l'in-flight de B.
    const c = dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    deferreds[1].resolve(new Response('new-session'));
    // B et C portent la nouvelle session — jamais celle de A.
    expect(await (await b).text()).toBe('new-session');
    expect(await (await c).text()).toBe('new-session');

    // Le cache réutilisable est celui de B : un appel suivant est servi du
    // cache (toujours 2 fetches) et porte la NOUVELLE session, pas celle de A.
    const d = await dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await d.text()).toBe('new-session');
  });

  it('amorce HTML consommée par A puis logout avant sa résolution : la vieille réponse amorcée ne pollue rien', async () => {
    // L'amorce du <head> est en vol (non résolue).
    let resolvePrime!: (response: Response | null) => void;
    window.__zeroSessionPrime = {
      at: Date.now(),
      promise: new Promise<Response | null>((resolve) => {
        resolvePrime = resolve;
      }),
    };

    const a = dedupedFetch(URL_A); // consomme l'amorce, aucun fetch réseau
    expect(fetchMock).toHaveBeenCalledTimes(0);

    invalidateGetSessionDedup(); // logout avant la résolution de l'amorce

    const b = dedupedFetch(URL_A); // nouvelle requête réseau
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePrime(new Response('old-primed-session'));
    await a; // l'appelant pré-logout la reçoit, sans effet partagé

    deferreds[0].resolve(new Response('new-session'));
    expect(await (await b).text()).toBe('new-session');

    // Le cache ne peut servir QUE la nouvelle session.
    const c = await dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await c.text()).toBe('new-session');
  });

  it('amorce jamais consommée : purgée par l’invalidation (aucune réutilisation post-logout)', async () => {
    window.__zeroSessionPrime = {
      at: Date.now(),
      promise: Promise.resolve(new Response('old-primed-session')),
    };

    invalidateGetSessionDedup(); // logout : l'amorce doit disparaître

    const a = dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1); // vraie requête, pas l'amorce
    deferreds[0].resolve(new Response('new-session'));
    expect(await (await a).text()).toBe('new-session');
  });

  it('sans invalidation : dédup nominale inchangée (un seul réseau, cache réutilisé)', async () => {
    const a = dedupedFetch(URL_A);
    const b = dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    deferreds[0].resolve(new Response('session'));
    expect(await (await a).text()).toBe('session');
    expect(await (await b).text()).toBe('session');
    const c = await dedupedFetch(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await c.text()).toBe('session');
  });
});
