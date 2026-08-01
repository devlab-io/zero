import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GmailTransport } from './google-transport';

// google-account appelle people() (People API) dans getUserInfo — on mocke la factory pour
// éviter tout réseau ; le reste passe par l'auth/transport factices.
const peopleGet = vi.fn();
vi.mock('@googleapis/people', () => ({
  people: vi.fn(() => ({ people: { get: peopleGet } })),
}));
const loggerSpy = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('../logger', () => ({ logger: loggerSpy }));

const { GmailAccount } = await import('./google-account');
const {
  makeFakeTransport,
  makeFakeGmail,
  data,
  gmailError: _gmailError,
} = await import('./__fixtures__/google-http-fake');

const asT = (t: unknown) => t as unknown as GmailTransport;

beforeEach(() => {
  peopleGet.mockReset();
  loggerSpy.error.mockClear();
});

describe('GmailAccount.getTokens', () => {
  it('échange le code contre des tokens via auth.getToken', async () => {
    const t = makeFakeTransport({
      auth: {
        getToken: vi.fn(async (code: string) => ({ tokens: { access_token: `at-${code}` } })),
      },
    });
    const out = await new GmailAccount(asT(t)).getTokens('auth-code');
    expect(out).toEqual({ tokens: { access_token: 'at-auth-code' } });
    expect(t.auth.getToken).toHaveBeenCalledWith('auth-code');
  });
});

describe('GmailAccount.getUserInfo', () => {
  it('extrait adresse/nom/photo du profil People', async () => {
    peopleGet.mockResolvedValue({
      data: {
        emailAddresses: [{ value: 'me@devlab.io' }],
        names: [{ displayName: 'Thomas V' }],
        photos: [{ url: 'https://photo/1.png' }],
      },
    });
    const out = await new GmailAccount(asT(makeFakeTransport({ auth: {} }))).getUserInfo();
    expect(out).toEqual({
      address: 'me@devlab.io',
      name: 'Thomas V',
      photo: 'https://photo/1.png',
    });
  });

  it('champs absents → chaînes vides', async () => {
    peopleGet.mockResolvedValue({ data: {} });
    const out = await new GmailAccount(asT(makeFakeTransport({ auth: {} }))).getUserInfo();
    expect(out).toEqual({ address: '', name: '', photo: '' });
  });
});

describe('GmailAccount.getEmailAliases', () => {
  it('renvoie l’email primaire + alias sendAs (en excluant le doublon primaire)', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.getProfile': () => data({ emailAddress: 'primary@devlab.io' }),
        'users.settings.sendAs.list': () =>
          data({
            sendAs: [
              { sendAsEmail: 'primary@devlab.io', isPrimary: true }, // doublon du primaire → ignoré
              { sendAsEmail: 'alias@devlab.io', displayName: 'Alias', isPrimary: false },
            ],
          }),
      }),
    });
    const out = await new GmailAccount(asT(t)).getEmailAliases();
    expect(out).toEqual([
      { email: 'primary@devlab.io', primary: true },
      { email: 'alias@devlab.io', name: 'Alias', primary: false },
    ]);
  });

  it('sans sendAs → uniquement l’email primaire', async () => {
    const t = makeFakeTransport({
      gmail: makeFakeGmail({
        'users.getProfile': () => data({ emailAddress: 'solo@devlab.io' }),
        'users.settings.sendAs.list': () => data({}),
      }),
    });
    const out = await new GmailAccount(asT(t)).getEmailAliases();
    expect(out).toEqual([{ email: 'solo@devlab.io', primary: true }]);
  });
});

describe('GmailAccount.revokeToken', () => {
  it('token valide → révoqué → true', async () => {
    const revokeToken = vi.fn(async () => ({ status: 200 }));
    const t = makeFakeTransport({ auth: { revokeToken } });
    await expect(new GmailAccount(asT(t)).revokeToken('tok')).resolves.toBe(true);
    expect(revokeToken).toHaveBeenCalledWith('tok');
  });

  it('token vide → false, aucun appel', async () => {
    const revokeToken = vi.fn();
    const t = makeFakeTransport({ auth: { revokeToken } });
    await expect(new GmailAccount(asT(t)).revokeToken('')).resolves.toBe(false);
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('révocation en échec → false + log d’erreur', async () => {
    const revokeToken = vi.fn(async () => {
      throw new Error('revoke failed');
    });
    const t = makeFakeTransport({ auth: { revokeToken } });
    await expect(new GmailAccount(asT(t)).revokeToken('tok')).resolves.toBe(false);
    expect(loggerSpy.error).toHaveBeenCalled();
  });
});
