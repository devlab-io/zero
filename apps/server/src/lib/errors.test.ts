import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { AppError, toTRPCError, toHonoResponse } from './errors';

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
    expect(toHonoResponse(AppError.internal('db pool exhausted at host X')).body.error.message).toBe(
      'Internal server error',
    );
  });

  it('passes an existing TRPCError through unchanged', () => {
    const orig = new TRPCError({ code: 'FORBIDDEN', message: 'nope' });
    expect(toTRPCError(orig)).toBe(orig);
  });
});
