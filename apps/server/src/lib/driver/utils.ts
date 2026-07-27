import { getActiveConnection, getZeroDB } from '../connection-context';
import { getContext } from 'hono/context-storage';
import type { gmail_v1 } from '@googleapis/gmail';
import type { HonoContext } from '../../ctx';
import { logger } from '../logger';

import { toByteArray } from 'base64-js';
export const FatalErrors = ['invalid_grant'];

export const deleteActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const activeConnection = await getActiveConnection();
  if (!activeConnection) return logger.info('No connection ID found');
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return logger.info('No session found');
  try {
    await c.var.auth.api.signOut({ headers: c.req.raw.headers });
    const db = await getZeroDB(session.user.id);
    await db.deleteActiveConnection(activeConnection.id);
  } catch (error) {
    logger.error('Server: Error deleting connection:', error);
    throw error;
  }
};

export const fromBase64Url = (str: string) => str.replace(/-/g, '+').replace(/_/g, '/');

export const fromBinary = (str: string) =>
  new TextDecoder().decode(toByteArray(str.replace(/-/g, '+').replace(/_/g, '/')));

export const findHtmlBody = (parts: gmail_v1.Schema$MessagePart[]): string => {
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return part.body.data;
    }
    if (part.parts) {
      const found = findHtmlBody(part.parts);
      if (found) return found;
    }
  }
  logger.info('⚠️ Driver: No HTML content found in message parts');
  return '';
};

/**
 * Forme d'erreur réellement produite par la pile Google installée.
 *
 * `gaxios` 6.7.1 (`build/src/common.js`, constructeur de `GaxiosError`) pose
 * `this.status = this.response.status` DÈS QU'UNE RÉPONSE HTTP EXISTE, et pose `this.code`
 * UNIQUEMENT dans `if (error && 'code' in error && error.code)` — c'est-à-dire seulement
 * pour une panne de TRANSPORT (undici/node). `googleapis-common` 7.2.0 n'en pose aucun.
 * Un 429, un 403-quota ou un 400 de Gmail arrivent donc SANS `code` et AVEC `status`.
 */
type ProviderErrorShape = {
  code?: unknown;
  status?: unknown;
  errors?: { reason?: string }[];
  response?: {
    status?: number;
    headers?: Record<string, string | string[] | undefined>;
    data?: { error?: { errors?: { reason?: string }[] } };
  };
};

const toFiniteStatus = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Ne recopie que ce qui sert au classement : le motif de quota et le Retry-After. */
const narrowProviderResponse = (error: ProviderErrorShape | null | undefined) => {
  const response = error?.response;
  if (!response) return undefined;
  const retryAfter = response.headers?.['retry-after'] ?? response.headers?.['Retry-After'];
  const reasons = response.data?.error?.errors;
  return {
    status: toFiniteStatus(response.status),
    ...(retryAfter === undefined ? {} : { headers: { 'retry-after': retryAfter } }),
    ...(Array.isArray(reasons)
      ? { data: { error: { errors: reasons.map((r) => ({ reason: r?.reason })) } } }
      : {}),
  };
};

/**
 * Enveloppe UNIQUE de toute erreur du driver Google (`GmailTransport.withErrorHandler`).
 *
 * Elle ne recopiait QUE `code` (`error?.code || 'UNKNOWN_ERROR'`) et jetait `status`,
 * `errors` et `response`. Conséquence mesurée : pour 400/401/403/404/408/413/422/429/500/503
 * l'enveloppe sortait avec `code: 'UNKNOWN_ERROR'` et rien d'autre, `extractStatus` rendait
 * `undefined`, et TOUT échec d'envoi était classé `ambiguous` — `not-accepted-retryable` et
 * `not-accepted-permanent` étaient du code mort sur le vrai chemin. Le verdict HTTP du
 * fournisseur est désormais porté par l'enveloppe, en plus du code de transport.
 *
 * `cause` est chaînée sur l'erreur d'origine pour que la détection de panne de transport
 * (`isNetworkError`, qui remonte `cause`) voie la vraie cause undici et pas seulement le
 * message recopié.
 */
export class StandardizedError extends Error {
  code: string;
  /** Statut HTTP du verdict fournisseur, quand il y en a un. */
  status?: number;
  /** Motifs Google de premier niveau (`errors[].reason`), quand ils existent. */
  errors?: { reason?: string }[];
  /** Sous-ensemble étroit de la réponse : statut, Retry-After, motifs. */
  response?: {
    status?: number;
    headers?: Record<string, string | string[] | undefined>;
    data?: { error?: { errors?: { reason?: string }[] } };
  };
  operation: string;
  context?: Record<string, unknown>;
  originalError: unknown;
  constructor(
    error: Error & ProviderErrorShape,
    operation: string,
    context?: Record<string, unknown>,
  ) {
    super(error?.message || 'An unknown error occurred', { cause: error });
    this.name = 'StandardizedError';
    const rawCode = error?.code;
    this.code =
      rawCode === undefined || rawCode === null || rawCode === ''
        ? 'UNKNOWN_ERROR'
        : String(rawCode);
    const status = toFiniteStatus(error?.status) ?? toFiniteStatus(error?.response?.status);
    if (status !== undefined) this.status = status;
    if (Array.isArray(error?.errors))
      this.errors = error.errors.map((r) => ({ reason: r?.reason }));
    const response = narrowProviderResponse(error);
    if (response) this.response = response;
    this.operation = operation;
    this.context = context;
    this.originalError = error;
  }
}

export function sanitizeContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  const sanitized = { ...context };
  const sensitive = ['tokens', 'refresh_token', 'code', 'message', 'raw', 'data'];
  for (const key of sensitive) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * Retrieves the original sender address for a forwarded email from SimpleLogin
 * from the headers of a Gmail email. Header: `X-SimpleLogin-Original-From`
 */
export function getSimpleLoginSender(payload: gmail_v1.Schema$Message['payload']) {
  return payload?.headers?.find((h) => h.name === 'X-SimpleLogin-Original-From')?.value || null;
}
