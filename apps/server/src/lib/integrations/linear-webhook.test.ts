import { computeHmacSha256Hex, timingSafeEqualHex, verifyLinearWebhook } from './linear-webhook';
import { describe, expect, it } from 'vitest';

const SECRET = 'whsec_test_secret';
const NOW = Date.parse('2026-08-02T10:00:00Z');

async function signedBody(payload: Record<string, unknown>) {
  const rawBody = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await computeHmacSha256Hex(SECRET, rawBody);
  return { rawBody, signature };
}

describe('webhook Linear entrant — HMAC brut timing-safe + horodatage strict', () => {
  it('signature valide + timestamp frais → payload parsé', async () => {
    const { rawBody, signature } = await signedBody({ type: 'Issue', webhookTimestamp: NOW });
    const result = await verifyLinearWebhook({
      rawBody,
      signatureHeader: signature,
      secret: SECRET,
      nowMs: NOW + 5_000,
    });
    expect(result).toMatchObject({ ok: true, payload: { type: 'Issue' } });
  });

  it('corps ALTÉRÉ après signature → bad_signature (vérifié sur octets bruts, avant parsing)', async () => {
    const { rawBody, signature } = await signedBody({ type: 'Issue', webhookTimestamp: NOW });
    const tampered = new Uint8Array(rawBody);
    tampered[tampered.length - 2] = 0x39; // mute un octet du JSON
    const result = await verifyLinearWebhook({
      rawBody: tampered,
      signatureHeader: signature,
      secret: SECRET,
      nowMs: NOW,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('signature absente, mauvais secret, ou longueur différente → refus', async () => {
    const { rawBody, signature } = await signedBody({ type: 'Issue', webhookTimestamp: NOW });
    for (const header of [undefined, '', signature.slice(0, -2), 'deadbeef']) {
      const result = await verifyLinearWebhook({
        rawBody,
        signatureHeader: header,
        secret: SECRET,
        nowMs: NOW,
      });
      expect(result).toEqual({ ok: false, reason: 'bad_signature' });
    }
    const wrongSecret = await verifyLinearWebhook({
      rawBody,
      signatureHeader: signature,
      secret: 'autre-secret',
      nowMs: NOW,
    });
    expect(wrongSecret).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('horodatage au-delà de ±60 s (rejeu différé) → stale_timestamp, même signé', async () => {
    const { rawBody, signature } = await signedBody({ type: 'Issue', webhookTimestamp: NOW });
    for (const nowMs of [NOW + 61_000, NOW - 61_000]) {
      const result = await verifyLinearWebhook({
        rawBody,
        signatureHeader: signature,
        secret: SECRET,
        nowMs,
      });
      expect(result).toEqual({ ok: false, reason: 'stale_timestamp' });
    }
    // Timestamp absent ou non numérique : refus aussi.
    const { rawBody: noTs, signature: noTsSig } = await signedBody({ type: 'Issue' });
    expect(
      await verifyLinearWebhook({
        rawBody: noTs,
        signatureHeader: noTsSig,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('corps signé mais non-JSON ou non-objet → bad_payload', async () => {
    const raw = new TextEncoder().encode('pas du json');
    const signature = await computeHmacSha256Hex(SECRET, raw);
    expect(
      await verifyLinearWebhook({
        rawBody: raw,
        signatureHeader: signature,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_payload' });
    const arr = new TextEncoder().encode('[1,2]');
    const arrSig = await computeHmacSha256Hex(SECRET, arr);
    expect(
      await verifyLinearWebhook({
        rawBody: arr,
        signatureHeader: arrSig,
        secret: SECRET,
        nowMs: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_payload' });
  });

  it('timingSafeEqualHex : égalité stricte, jamais de préfixe accepté', () => {
    expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false);
    expect(timingSafeEqualHex('abcd', 'abc')).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(true);
  });
});
