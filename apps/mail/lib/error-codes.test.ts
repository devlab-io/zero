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

  /**
   * LA FORME QUE LA PRODUCTION FABRIQUE RÉELLEMENT sur ce parcours.
   *
   * Une connexion dont l'octroi OAuth a perdu ses jetons fait lever
   * `AppError.connectionExpired('Invalid connection …')` DANS le Durable Object ZeroDriver.
   * Le message qui arrive ici est donc APLATI (il traverse la frontière RPC puis
   * `getShardClient`), et le seul discriminant utilisable est `data.appCode`.
   *
   * Le test précédent portait `{message: 'Invalid connection "abc"'}` SANS `appCode` : une
   * forme qu'aucune erreur tRPC ne prend, puisque l'`errorFormatter` en pose un sur toutes.
   * Il ne prouvait donc rien du parcours réel — et le parcours réel était cassé.
   *
   * Chaîne serveur correspondante, éprouvée de bout en bout :
   * `apps/server/src/lib/reconnect-path.test.ts`.
   */
  it('coupe sur la forme RÉELLE d’une connexion sans jetons (message aplati + code)', () => {
    expect(
      requiresReauthorization({
        data: { appCode: 'CONNECTION_EXPIRED' },
        message: 'Invalid connection "conn-1"',
      }),
    ).toBe(true);
    // Même forme, message reformulé par le serveur : la décision ne bouge pas.
    expect(
      requiresReauthorization({
        data: { appCode: 'CONNECTION_EXPIRED' },
        message: 'Connection expired. Please reconnect.',
      }),
    ).toBe(true);
  });

  it('ne coupe PAS sur la forme d’AVANT correction (appCode INTERNAL) — le client ne peut pas deviner', () => {
    // C'est exactement ce que produisait la chaîne cassée. Aucune lecture côté client ne
    // pouvait la distinguer d'une erreur interne quelconque portant la même sous-chaîne :
    // la correction ne pouvait être QUE serveur.
    expect(
      requiresReauthorization({
        data: { appCode: 'INTERNAL' },
        message: 'Shard initialization failed: Error: Invalid connection "conn-1"',
      }),
    ).toBe(false);
  });

  it('le repli sur libellés ne couvre que les erreurs SANS code (hors tRPC)', () => {
    // Erreurs `authClient`/`fetch` : elles ne passent pas par l'`errorFormatter`, donc
    // n'exposent aucun `appCode`. C'est la seule population que ce repli atteint encore.
    expect(requiresReauthorization({ message: 'Required scopes missing' })).toBe(true);
    expect(requiresReauthorization({ message: 'Invalid connection "abc"' })).toBe(true);
    expect(requiresReauthorization({ message: 'Something went wrong' })).toBe(false);
    expect(requiresReauthorization(null)).toBe(false);
  });
});
