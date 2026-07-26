import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('./logger', () => ({ logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() } }));

import {
  __resetPubSubPolicyWarning,
  checkPubSubClaims,
  resolvePubSubTokenPolicy,
  verifyPubSubToken,
  type JwtDecoder,
} from './pubsub-auth';

const SERVICE_ACCOUNT = 'gmail-push@zero-prod.iam.gserviceaccount.com';
const AUDIENCE = 'https://server.example.test/a8n/notify/google';

const basePayload = {
  iss: 'https://accounts.google.com',
  email: SERVICE_ACCOUNT,
  email_verified: true,
  aud: AUDIENCE,
};

// --- Bloc cryptographique réel -------------------------------------------------------
// Une paire de clés est générée localement, le jeton est réellement signé, et la
// vérification passe par `jose` avec un JWKS local. Aucune simulation du décodeur : c'est la
// signature elle-même qui est éprouvée.
const buildRealVerifier = async () => {
  const good = await generateKeyPair('RS256', { extractable: true });
  const evil = await generateKeyPair('RS256', { extractable: true });

  const jwk = { ...(await exportJWK(good.publicKey)), alg: 'RS256', kid: 'test-key' };
  const keySet = createLocalJWKSet({ keys: [jwk] });

  const decode: JwtDecoder = async (token) => {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
    });
    return payload;
  };

  const sign = (claims: Record<string, unknown>, key: CryptoKey = good.privateKey) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);

  return { decode, sign, evilKey: evil.privateKey };
};

describe('verifyPubSubToken — signature (fail-closed, inconditionnel)', () => {
  it('accepte un jeton réellement signé par la clé Google attendue', async () => {
    const { decode, sign } = await buildRealVerifier();
    const token = await sign(basePayload);

    const result = await verifyPubSubToken(
      token,
      { audience: AUDIENCE, serviceAccountEmail: SERVICE_ACCOUNT },
      decode,
    );

    expect(result).toEqual({ ok: true, email: SERVICE_ACCOUNT });
  });

  it('refuse un jeton signé par une AUTRE clé — le trou historique du tokeninfo', async () => {
    const { decode, sign, evilKey } = await buildRealVerifier();
    const forged = await sign(basePayload, evilKey);

    const result = await verifyPubSubToken(forged, { audience: AUDIENCE }, decode);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/signature verification failed/);
  });

  it('refuse un jeton expiré', async () => {
    const { decode } = await buildRealVerifier();
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const expired = await new SignJWT(basePayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    const result = await verifyPubSubToken(expired, {}, decode);
    expect(result.ok).toBe(false);
  });

  it('refuse un jeton absent sans appeler le décodeur', async () => {
    const decode = vi.fn();
    const result = await verifyPubSubToken(undefined, {}, decode as unknown as JwtDecoder);

    expect(result).toEqual({ ok: false, reason: 'missing token' });
    expect(decode).not.toHaveBeenCalled();
  });

  it('ne lève jamais, même si le décodeur explose', async () => {
    const decode: JwtDecoder = async () => {
      throw new TypeError('boom');
    };
    await expect(verifyPubSubToken('x.y.z', {}, decode)).resolves.toMatchObject({ ok: false });
  });
});

describe('checkPubSubClaims — revendications toujours exigées', () => {
  it("accepte les deux formes d'émetteur Google", () => {
    for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
      expect(checkPubSubClaims({ ...basePayload, iss }, {}).ok).toBe(true);
    }
  });

  it('refuse un émetteur étranger', () => {
    const result = checkPubSubClaims({ ...basePayload, iss: 'https://evil.example' }, {});
    expect(result).toEqual({ ok: false, reason: 'unexpected issuer: https://evil.example' });
  });

  it('refuse un émetteur absent', () => {
    const result = checkPubSubClaims({ email: SERVICE_ACCOUNT, email_verified: true }, {});
    expect(result.ok).toBe(false);
  });

  it('refuse email_verified absent, faux, ou la chaîne "true"', () => {
    for (const email_verified of [undefined, false, 'true']) {
      expect(checkPubSubClaims({ ...basePayload, email_verified }, {}).ok).toBe(false);
    }
  });

  it('refuse un email absent ou vide', () => {
    expect(checkPubSubClaims({ ...basePayload, email: undefined }, {}).ok).toBe(false);
    expect(checkPubSubClaims({ ...basePayload, email: '   ' }, {}).ok).toBe(false);
  });
});

describe('checkPubSubClaims — revendications conditionnelles', () => {
  it("refuse un jeton émis pour une AUTRE application quand l'audience est configurée", () => {
    const result = checkPubSubClaims(
      { ...basePayload, aud: 'https://someone-else.example/hook' },
      { audience: AUDIENCE },
    );
    expect(result).toEqual({
      ok: false,
      reason: 'aud claim does not match the expected audience',
    });
  });

  it('accepte une audience listée parmi plusieurs', () => {
    const result = checkPubSubClaims(
      { ...basePayload, aud: ['https://other.example', AUDIENCE] },
      { audience: AUDIENCE },
    );
    expect(result.ok).toBe(true);
  });

  it("refuse un jeton émis par un AUTRE compte de service quand l'email attendu est configuré", () => {
    const result = checkPubSubClaims(
      { ...basePayload, email: 'attacker@evil.iam.gserviceaccount.com' },
      { serviceAccountEmail: SERVICE_ACCOUNT },
    );
    expect(result).toEqual({
      ok: false,
      reason: 'email claim does not match the expected service account',
    });
  });

  it('compare les emails sans tenir compte de la casse', () => {
    const result = checkPubSubClaims(
      { ...basePayload, email: SERVICE_ACCOUNT.toUpperCase() },
      { serviceAccountEmail: SERVICE_ACCOUNT },
    );
    expect(result.ok).toBe(true);
  });

  it("laisse passer une audience quelconque quand l'audience n'est pas configurée", () => {
    const result = checkPubSubClaims({ ...basePayload, aud: 'anything' }, {});
    expect(result.ok).toBe(true);
  });
});

describe('resolvePubSubTokenPolicy', () => {
  beforeEach(() => {
    warn.mockClear();
    __resetPubSubPolicyWarning();
  });

  it('préfère les variables explicites', () => {
    expect(
      resolvePubSubTokenPolicy({
        PUBSUB_AUDIENCE: AUDIENCE,
        PUBSUB_SERVICE_ACCOUNT_EMAIL: SERVICE_ACCOUNT,
        GOOGLE_S_ACCOUNT: JSON.stringify({ client_email: 'ignored@example.com' }),
      }),
    ).toEqual({ audience: AUDIENCE, serviceAccountEmail: SERVICE_ACCOUNT });
    expect(warn).not.toHaveBeenCalled();
  });

  it('se replie sur le client_email de GOOGLE_S_ACCOUNT', () => {
    const policy = resolvePubSubTokenPolicy({
      GOOGLE_S_ACCOUNT: JSON.stringify({ client_email: SERVICE_ACCOUNT, project_id: 'p' }),
    });
    expect(policy.serviceAccountEmail).toBe(SERVICE_ACCOUNT);
  });

  it('survit à un GOOGLE_S_ACCOUNT vide, illisible ou sans client_email', () => {
    for (const GOOGLE_S_ACCOUNT of ['{}', 'not json', JSON.stringify({ project_id: 'p' }), '']) {
      expect(resolvePubSubTokenPolicy({ GOOGLE_S_ACCOUNT }).serviceAccountEmail).toBeUndefined();
    }
  });

  it('journalise un avertissement, une seule fois, quand la politique est partielle', () => {
    resolvePubSubTokenPolicy({});
    resolvePubSubTokenPolicy({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toMatchObject({
      audienceChecked: false,
      serviceAccountChecked: false,
      missing: ['PUBSUB_AUDIENCE', 'PUBSUB_SERVICE_ACCOUNT_EMAIL'],
    });
  });
});
