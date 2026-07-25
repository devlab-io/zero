import { describe, expect, it, vi, beforeEach } from 'vitest';

// utils.ts importe `../connection-context` (→ env/Workers, module feuille extrait de
// server-utils pour casser le cycle server-utils ↔ driver) et `hono/context-storage`.
// On neutralise ces DEUX feuilles lourdes pour charger le VRAI module utils (fonctions
// pures testées en réel), sans réseau ni runtime Workers.
const getActiveConnection = vi.fn();
const getZeroDB = vi.fn();
vi.mock('../connection-context', () => ({ getActiveConnection, getZeroDB }));
const getContext = vi.fn(() => ({}));
vi.mock('hono/context-storage', () => ({ getContext }));
const loggerSpy = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('../logger', () => ({ logger: loggerSpy }));

const {
  fromBase64Url,
  fromBinary,
  findHtmlBody,
  getSimpleLoginSender,
  sanitizeContext,
  StandardizedError,
  FatalErrors,
  deleteActiveConnection,
} = await import('./utils');

const toBase64Url = (s: string) =>
  Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

beforeEach(() => {
  loggerSpy.info.mockClear();
  getActiveConnection.mockReset();
});

describe('fromBase64Url — remappe l’alphabet URL-safe', () => {
  it('remplace - par + et _ par /', () => {
    expect(fromBase64Url('a-b_c')).toBe('a+b/c');
  });
  it('chaîne standard inchangée', () => {
    expect(fromBase64Url('abcABC123')).toBe('abcABC123');
  });
});

describe('fromBinary — décode base64url en UTF-8', () => {
  it('round-trip d’un texte accentué + emoji', () => {
    const original = 'Héllo — çà va? 🌊';
    expect(fromBinary(toBase64Url(original))).toBe(original);
  });
  it('décode un HTML simple', () => {
    expect(fromBinary(toBase64Url('<p>hi</p>'))).toBe('<p>hi</p>');
  });
});

describe('findHtmlBody — extrait le premier corps text/html', () => {
  it('trouve le body text/html au premier niveau', () => {
    expect(
      findHtmlBody([
        { mimeType: 'text/plain', body: { data: 'PLAIN' } },
        { mimeType: 'text/html', body: { data: 'HTML' } },
      ]),
    ).toBe('HTML');
  });

  it('descend récursivement dans les parts imbriquées', () => {
    expect(
      findHtmlBody([
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/html', body: { data: 'NESTED' } }],
        },
      ]),
    ).toBe('NESTED');
  });

  it('aucun HTML → chaîne vide + log d’avertissement', () => {
    expect(findHtmlBody([{ mimeType: 'text/plain', body: { data: 'x' } }])).toBe('');
    expect(loggerSpy.info).toHaveBeenCalledWith(
      '⚠️ Driver: No HTML content found in message parts',
    );
  });
});

describe('getSimpleLoginSender — en-tête X-SimpleLogin-Original-From', () => {
  it('présent → sa valeur', () => {
    expect(
      getSimpleLoginSender({
        headers: [{ name: 'X-SimpleLogin-Original-From', value: 'real@sender.io' }],
      }),
    ).toBe('real@sender.io');
  });
  it('absent → null', () => {
    expect(getSimpleLoginSender({ headers: [{ name: 'From', value: 'x@y.z' }] })).toBeNull();
    expect(getSimpleLoginSender(undefined)).toBeNull();
  });
});

describe('sanitizeContext — masque les champs sensibles', () => {
  it('undefined → undefined', () => {
    expect(sanitizeContext(undefined)).toBeUndefined();
  });
  it('redacte tokens/refresh_token/code/message/raw/data, garde le reste', () => {
    const out = sanitizeContext({
      email: 'a@b.c',
      tokens: 'secret',
      refresh_token: 'r',
      code: 'c',
      message: 'm',
      raw: 'rawdata',
      data: 'd',
      keep: 42,
    });
    expect(out).toEqual({
      email: 'a@b.c',
      tokens: '[REDACTED]',
      refresh_token: '[REDACTED]',
      code: '[REDACTED]',
      message: '[REDACTED]',
      raw: '[REDACTED]',
      data: '[REDACTED]',
      keep: 42,
    });
  });
});

describe('StandardizedError — normalise l’erreur du driver', () => {
  it('reprend message/code, expose operation/context/originalError', () => {
    const original = Object.assign(new Error('boom'), { code: 'E_AUTH' });
    const err = new StandardizedError(original, 'getThread', { id: 't1' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StandardizedError');
    expect(err.message).toBe('boom');
    expect(err.code).toBe('E_AUTH');
    expect(err.operation).toBe('getThread');
    expect(err.context).toEqual({ id: 't1' });
    expect(err.originalError).toBe(original);
  });

  it('valeurs par défaut sans message ni code', () => {
    const err = new StandardizedError({} as Error & { code: string }, 'op');
    expect(err.message).toBe('An unknown error occurred');
    expect(err.code).toBe('UNKNOWN_ERROR');
  });
});

describe('FatalErrors + deleteActiveConnection', () => {
  it('FatalErrors contient invalid_grant', () => {
    expect(FatalErrors).toContain('invalid_grant');
  });

  it('aucune connexion active → log “No connection ID found”, aucun throw', async () => {
    getActiveConnection.mockResolvedValue(null);
    await expect(deleteActiveConnection()).resolves.toBeUndefined();
    expect(loggerSpy.info).toHaveBeenCalledWith('No connection ID found');
    expect(getZeroDB).not.toHaveBeenCalled();
  });
});
