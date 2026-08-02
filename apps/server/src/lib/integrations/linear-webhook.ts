/**
 * Vérification des webhooks Linear ENTRANTS (P18) — sur OCTETS BRUTS, AVANT
 * tout parsing JSON : `Linear-Signature` = HMAC-SHA256 hex du corps brut avec
 * le signing secret de l'application ; comparaison à TEMPS CONSTANT ;
 * `webhookTimestamp` (dans le corps, ms) borné à ±60 s. Tout échec est un
 * refus — jamais un traitement partiel.
 */
import { LINEAR_WEBHOOK_MAX_SKEW_MS } from '../teams/team-integrations-shared';

const encoder = new TextEncoder();

export async function computeHmacSha256Hex(secret: string, payload: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, payload as BufferSource));
  return [...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Comparaison à temps constant sur la LONGUEUR MAXIMALE des deux entrées —
 * une longueur différente échoue sans court-circuit dépendant du contenu.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export type LinearWebhookVerification =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'bad_signature' | 'bad_payload' | 'stale_timestamp' };

export async function verifyLinearWebhook(input: {
  rawBody: Uint8Array;
  signatureHeader: string | undefined;
  secret: string;
  nowMs: number;
}): Promise<LinearWebhookVerification> {
  // 1) Signature sur les octets bruts — AVANT tout JSON.parse.
  const expected = await computeHmacSha256Hex(input.secret, input.rawBody);
  const provided = (input.signatureHeader ?? '').trim().toLowerCase();
  if (!provided || !timingSafeEqualHex(expected, provided)) {
    return { ok: false, reason: 'bad_signature' };
  }
  // 2) Parsing du corps AUTHENTIFIÉ seulement.
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(input.rawBody));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: 'bad_payload' };
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  // 3) Anti-rejeu temporel STRICT : webhookTimestamp (ms) à ±60 s.
  const timestamp = Number(payload['webhookTimestamp']);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(input.nowMs - timestamp) > LINEAR_WEBHOOK_MAX_SKEW_MS
  ) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  return { ok: true, payload };
}
