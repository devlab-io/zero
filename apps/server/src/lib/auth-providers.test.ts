import { describe, expect, it, vi, beforeEach } from 'vitest';

const loggerSpy = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('./logger', () => ({ logger: loggerSpy }));

const { authProviders, isProviderEnabled, getSocialProviders } = await import('./auth-providers');

const fullEnv = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' } as Record<string, string>;

beforeEach(() => {
  loggerSpy.error.mockClear();
  loggerSpy.warn.mockClear();
});

describe('authProviders — config du provider Google', () => {
  it('déclare google avec la portée OAuth minimale (jamais mail.google.com)', () => {
    const [google] = authProviders(fullEnv);
    expect(google.id).toBe('google');
    expect(google.required).toBe(true);
    const cfg = google.config as { scope: string[]; accessType: string; clientId: string };
    expect(cfg.accessType).toBe('offline');
    expect(cfg.clientId).toBe('cid');
    expect(cfg.scope).toContain('https://www.googleapis.com/auth/gmail.modify');
    expect(cfg.scope).toContain('https://www.googleapis.com/auth/gmail.compose');
    expect(cfg.scope.join(' ')).not.toContain('mail.google.com');
  });

  it('prompt = "consent" seulement si FORCE_GOOGLE_AUTH', () => {
    const forced = authProviders({ ...fullEnv, FORCE_GOOGLE_AUTH: '1' });
    expect((forced[0].config as { prompt?: string }).prompt).toBe('consent');
    const relaxed = authProviders(fullEnv);
    expect((relaxed[0].config as { prompt?: string }).prompt).toBeUndefined();
  });
});

describe('isProviderEnabled', () => {
  it('true quand toutes les variables requises sont présentes', () => {
    const [google] = authProviders(fullEnv);
    expect(isProviderEnabled(google, fullEnv)).toBe(true);
    expect(loggerSpy.error).not.toHaveBeenCalled();
  });

  it('false + log d’erreur quand une variable requise manque (provider requis)', () => {
    const [google] = authProviders(fullEnv);
    expect(isProviderEnabled(google, { GOOGLE_CLIENT_ID: 'cid' })).toBe(false);
    expect(loggerSpy.error).toHaveBeenCalled();
    // le message nomme la variable manquante
    expect(loggerSpy.error.mock.calls.flat().join(' ')).toContain('GOOGLE_CLIENT_SECRET');
  });

  it('true inconditionnel pour un provider custom', () => {
    expect(isProviderEnabled({ isCustom: true } as never, {})).toBe(true);
  });
});

describe('getSocialProviders', () => {
  it('mappe id → config quand le provider est activé', () => {
    const social = getSocialProviders(fullEnv);
    expect(Object.keys(social)).toEqual(['google']);
    expect((social.google as { accessType: string }).accessType).toBe('offline');
  });

  it('lève quand un provider REQUIS n’est pas configuré', () => {
    expect(() => getSocialProviders({})).toThrow(/google.*not configured/i);
  });
});
