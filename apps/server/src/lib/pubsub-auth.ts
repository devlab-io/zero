// lib/pubsub-auth.ts — vérification du jeton OIDC porté par les notifications push Pub/Sub.
//
// L'ancien contrôle (server-utils.ts `verifyToken`) appelait l'endpoint public
// `oauth2.googleapis.com/tokeninfo` et retournait `!!data` : n'importe quel jeton ID Google
// valide — émis pour n'importe quelle application, par n'importe quel compte — était accepté,
// puis pilotait le curseur de synchronisation Gmail (pipelines.ts). Autrement dit : un contrôle
// d'autorisation qui n'autorisait rien.
//
// Ici la vérification est LOCALE (jose + JWKS Google), donc la signature est réellement
// contrôlée, et les revendications sont confrontées à une politique explicite.
//
// Politique — ce qui est TOUJOURS exigé (fail-closed, vérifiable sans configuration) :
//   - signature valide contre les JWKS Google, et `exp`/`nbf` dans les clous (jose) ;
//   - `iss` ∈ { accounts.google.com, https://accounts.google.com } ;
//   - `email_verified === true` ;
//   - `email` présent et non vide.
// Ce qui est CONDITIONNEL, faute de pouvoir mesurer la production depuis ici :
//   - `email` == compte de service attendu. Attendu = `PUBSUB_SERVICE_ACCOUNT_EMAIL` si
//     configuré, sinon le `client_email` de `GOOGLE_S_ACCOUNT` — c'est-à-dire exactement la
//     valeur que ce même code écrit dans `pushConfig.oidcToken.serviceAccountEmail` quand il
//     crée l'abonnement (lib/factories/google-subscription.factory.ts). Une divergence n'est
//     donc possible que si l'abonnement a été créé par un autre compte de service.
//   - `aud` == `PUBSUB_AUDIENCE`. Pub/Sub, quand `oidcToken.audience` n'est pas renseigné
//     (c'est le cas ici), utilise l'URL du endpoint push comme audience — soit
//     `${VITE_PUBLIC_BACKEND_URL}/a8n/notify/google`. Cette valeur n'est PAS déduite
//     automatiquement : elle n'a pas pu être confrontée à la production, et une déduction
//     fausse couperait la synchronisation en silence. Renseigner `PUBSUB_AUDIENCE` ferme la
//     dernière marge ; tant qu'elle est absente, un avertissement est journalisé.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from './logger';
import { env } from '../env';

/** Les deux formes d'émetteur que Google produit pour un jeton ID. */
export const GOOGLE_OIDC_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'] as const;

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

export type PubSubTokenPolicy = {
  /** Audience exigée. `null`/`undefined` = contrôle désactivé (voir en-tête). */
  audience?: string | null;
  /** Compte de service émetteur exigé. `null`/`undefined` = contrôle désactivé. */
  serviceAccountEmail?: string | null;
};

export type PubSubTokenCheck = { ok: true; email: string } | { ok: false; reason: string };

const asAudienceList = (aud: JWTPayload['aud']): string[] => {
  if (typeof aud === 'string') return [aud];
  if (Array.isArray(aud)) return aud.filter((value): value is string => typeof value === 'string');
  return [];
};

/**
 * Confronte les revendications d'un jeton DÉJÀ vérifié cryptographiquement à la politique.
 * Pure et sans I/O : c'est le cœur testable de l'autorisation.
 */
export function checkPubSubClaims(
  payload: JWTPayload,
  policy: PubSubTokenPolicy = {},
): PubSubTokenCheck {
  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  if (!(GOOGLE_OIDC_ISSUERS as readonly string[]).includes(issuer)) {
    return { ok: false, reason: `unexpected issuer: ${issuer || '(missing)'}` };
  }

  if (payload.email_verified !== true) {
    return { ok: false, reason: 'email_verified claim is not true' };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!email) {
    return { ok: false, reason: 'missing email claim' };
  }

  const expectedEmail = policy.serviceAccountEmail?.trim();
  if (expectedEmail && email.toLowerCase() !== expectedEmail.toLowerCase()) {
    return { ok: false, reason: 'email claim does not match the expected service account' };
  }

  const expectedAudience = policy.audience?.trim();
  if (expectedAudience && !asAudienceList(payload.aud).includes(expectedAudience)) {
    return { ok: false, reason: 'aud claim does not match the expected audience' };
  }

  return { ok: true, email };
}

/** Résout la clé publique Google. Singleton : `jose` gère son propre cache et sa rotation. */
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
const googleJwks = () => (remoteJwks ??= createRemoteJWKSet(GOOGLE_JWKS_URL));

/** Décodeur injectable — la vérification cryptographique réelle par défaut. */
export type JwtDecoder = (token: string) => Promise<JWTPayload>;

const decodeWithGoogleJwks: JwtDecoder = async (token) => {
  const { payload } = await jwtVerify(token, googleJwks(), {
    issuer: [...GOOGLE_OIDC_ISSUERS],
  });
  return payload;
};

/**
 * Vérifie un jeton OIDC de notification push Pub/Sub : signature d'abord, revendications
 * ensuite. Ne lève jamais — un jeton illisible est un refus, pas une 500.
 */
export async function verifyPubSubToken(
  token: string | undefined | null,
  policy: PubSubTokenPolicy = {},
  decode: JwtDecoder = decodeWithGoogleJwks,
): Promise<PubSubTokenCheck> {
  const raw = token?.trim();
  if (!raw) return { ok: false, reason: 'missing token' };

  let payload: JWTPayload;
  try {
    payload = await decode(raw);
  } catch (error) {
    return {
      ok: false,
      reason: `signature verification failed (${error instanceof Error ? error.name : 'unknown'})`,
    };
  }

  return checkPubSubClaims(payload, policy);
}

/** `client_email` du compte de service, lu depuis `GOOGLE_S_ACCOUNT` sans jamais lever. */
const serviceAccountEmailFromEnv = (raw: string | undefined): string | undefined => {
  if (!raw || raw === '{}') return undefined;
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown };
    return typeof parsed.client_email === 'string' && parsed.client_email
      ? parsed.client_email
      : undefined;
  } catch {
    return undefined;
  }
};

let warnedAboutPolicy = false;

/** Construit la politique à partir de l'environnement, et prévient une fois si elle est partielle. */
export function resolvePubSubTokenPolicy(
  source: {
    PUBSUB_AUDIENCE?: string;
    PUBSUB_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_S_ACCOUNT?: string;
  } = env,
): PubSubTokenPolicy {
  const audience = source.PUBSUB_AUDIENCE?.trim() || undefined;
  const serviceAccountEmail =
    source.PUBSUB_SERVICE_ACCOUNT_EMAIL?.trim() ||
    serviceAccountEmailFromEnv(source.GOOGLE_S_ACCOUNT);

  if (!warnedAboutPolicy && (!audience || !serviceAccountEmail)) {
    warnedAboutPolicy = true;
    logger.warn('[PUBSUB_AUTH] partial push-token policy — set the missing variable(s)', {
      audienceChecked: Boolean(audience),
      serviceAccountChecked: Boolean(serviceAccountEmail),
      missing: [
        audience ? null : 'PUBSUB_AUDIENCE',
        serviceAccountEmail ? null : 'PUBSUB_SERVICE_ACCOUNT_EMAIL',
      ].filter(Boolean),
    });
  }

  return { audience, serviceAccountEmail };
}

/** Réinitialise l'avertissement une-fois-par-isolate. Réservé aux tests. */
export const __resetPubSubPolicyWarning = () => {
  warnedAboutPolicy = false;
};
