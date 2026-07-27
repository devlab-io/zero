import { AppError, toTRPCError, toHonoResponse, resolveErrorCode } from './errors';
import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';

describe('error taxonomy', () => {
  it('maps a business AppError to a stable tRPC code, keeping the message', () => {
    const e = toTRPCError(AppError.notFound('thread missing'));
    expect(e).toBeInstanceOf(TRPCError);
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('thread missing');
  });

  it('maps a business AppError to a normalised Hono response with a stable code', () => {
    const r = toHonoResponse(AppError.validation('bad input'));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION');
    expect(r.body.error.message).toBe('bad input');
  });

  it('coerces an unknown error to a generic 500 without leaking its message (Hono)', () => {
    const r = toHonoResponse(new Error('DATABASE_URL=postgres://user:pw@host/db'));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL');
    expect(r.body.error.message).toBe('Internal server error');
    expect(JSON.stringify(r)).not.toContain('pw@host');
  });

  it('coerces an unknown error to INTERNAL_SERVER_ERROR without leaking (tRPC)', () => {
    const e = toTRPCError(new Error('secret stack detail'));
    expect(e.code).toBe('INTERNAL_SERVER_ERROR');
    expect(e.message).toBe('Internal server error');
    expect(e.message).not.toContain('secret');
  });

  it('never exposes an INTERNAL AppError message to the client', () => {
    expect(toTRPCError(AppError.internal('db pool exhausted at host X')).message).toBe(
      'Internal server error',
    );
    expect(
      toHonoResponse(AppError.internal('db pool exhausted at host X')).body.error.message,
    ).toBe('Internal server error');
  });

  it('passes an existing TRPCError through unchanged', () => {
    const orig = new TRPCError({ code: 'FORBIDDEN', message: 'nope' });
    expect(toTRPCError(orig)).toBe(orig);
  });
});

/**
 * P7 — le module vivait sans aucun importateur de production, pendant que les décisions
 * d'authentification se prenaient par comparaison de chaînes à travers le réseau.
 * `resolveErrorCode` est le point unique d'où sort le code publié par l'`errorFormatter`
 * tRPC ; ces tests figent son contrat.
 */
describe('resolveErrorCode — code stable sur le fil (P7)', () => {
  it('rend le code d’une AppError levée telle quelle', () => {
    expect(resolveErrorCode(AppError.missingScopes())).toBe('MISSING_SCOPES');
    expect(resolveErrorCode(AppError.connectionExpired())).toBe('CONNECTION_EXPIRED');
    expect(resolveErrorCode(AppError.unavailable())).toBe('UNAVAILABLE');
  });

  it('retrouve le code à travers le TRPCError qui l’enveloppe', () => {
    expect(resolveErrorCode(toTRPCError(AppError.missingScopes()))).toBe('MISSING_SCOPES');
    expect(resolveErrorCode(toTRPCError(AppError.connectionExpired()))).toBe('CONNECTION_EXPIRED');
  });

  it('rétrograde un TRPCError nu sur la table de correspondance', () => {
    expect(resolveErrorCode(new TRPCError({ code: 'NOT_FOUND' }))).toBe('NOT_FOUND');
    expect(resolveErrorCode(new TRPCError({ code: 'SERVICE_UNAVAILABLE' }))).toBe('UNAVAILABLE');
    expect(resolveErrorCode(new TRPCError({ code: 'TIMEOUT' }))).toBe('INTERNAL');
  });

  it('rend INTERNAL pour tout ce qui n’est pas une erreur connue', () => {
    expect(resolveErrorCode(new Error('boom'))).toBe('INTERNAL');
    expect(resolveErrorCode('boom')).toBe('INTERNAL');
    expect(resolveErrorCode(undefined)).toBe('INTERNAL');
  });

  it('les codes d’auth conservent le statut HTTP historique (aucune rupture de fil)', () => {
    expect(toHonoResponse(AppError.missingScopes()).status).toBe(400);
    expect(toHonoResponse(AppError.connectionExpired()).status).toBe(401);
    expect(toHonoResponse(AppError.unavailable()).status).toBe(503);
    expect(toTRPCError(AppError.missingScopes()).code).toBe('BAD_REQUEST');
    expect(toTRPCError(AppError.connectionExpired()).code).toBe('UNAUTHORIZED');
    expect(toTRPCError(AppError.unavailable()).code).toBe('SERVICE_UNAVAILABLE');
  });
});
