import { extractAppCode, requiresReauthorization } from './error-codes';
import { describe, expect, it } from 'vitest';

/**
 * P7 — l'UI décidait de déconnecter en comparant des messages à travers la frontière
 * réseau (`err.message === 'Required scopes missing'`). Elle lit désormais le code stable
 * publié par l'`errorFormatter` tRPC du serveur.
 */
describe('extractAppCode', () => {
  it('lit le code sur `data` (forme TRPCClientError)', () => {
    expect(extractAppCode({ data: { appCode: 'MISSING_SCOPES' } })).toBe('MISSING_SCOPES');
  });

  it('lit le code sur `shape.data` (forme brute de l’enveloppe)', () => {
    expect(extractAppCode({ shape: { data: { appCode: 'CONNECTION_EXPIRED' } } })).toBe(
      'CONNECTION_EXPIRED',
    );
  });

  it('rend null quand rien n’est exposé', () => {
    expect(extractAppCode(new Error('x'))).toBeNull();
    expect(extractAppCode(null)).toBeNull();
    expect(extractAppCode({ data: { httpStatus: 500 } })).toBeNull();
  });
});

describe('requiresReauthorization', () => {
  it('coupe la session sur les deux codes d’octroi inutilisable', () => {
    expect(requiresReauthorization({ data: { appCode: 'MISSING_SCOPES' } })).toBe(true);
    expect(requiresReauthorization({ data: { appCode: 'CONNECTION_EXPIRED' } })).toBe(true);
  });

  it('ne coupe PAS sur une panne transitoire', () => {
    expect(requiresReauthorization({ data: { appCode: 'UNAVAILABLE' } })).toBe(false);
    expect(requiresReauthorization({ data: { appCode: 'INTERNAL' } })).toBe(false);
    expect(requiresReauthorization({ data: { appCode: 'RATE_LIMITED' } })).toBe(false);
  });

  it('ne coupe PAS sur une erreur dont le message contient par hasard la sous-chaîne', () => {
    expect(
      requiresReauthorization({
        data: { appCode: 'INTERNAL' },
        message: 'Invalid connection string in the log formatter',
      }),
    ).toBe(false);
  });

  it('conserve le repli sur les libellés historiques tant qu’aucun code n’est publié', () => {
    expect(requiresReauthorization({ message: 'Required scopes missing' })).toBe(true);
    expect(requiresReauthorization({ message: 'Invalid connection "abc"' })).toBe(true);
    expect(requiresReauthorization({ message: 'Something went wrong' })).toBe(false);
    expect(requiresReauthorization(null)).toBe(false);
  });
});
