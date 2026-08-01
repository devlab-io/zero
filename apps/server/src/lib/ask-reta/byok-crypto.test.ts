import {
  decodeKek,
  decodeKekRing,
  decryptApiKey,
  encryptApiKey,
  MAX_API_KEY_BYTES,
  rewrapEnvelope,
  zeroize,
} from './byok-crypto';
import { describe, expect, it } from 'vitest';

// P0 vault crypto (slice 3A): the envelope must open ONLY with the exact
// user + provider + row id + KEK version it was sealed for — any relocation
// or tamper fails closed.

const kekA = new Uint8Array(32).fill(7);
const kekB = new Uint8Array(32).fill(9);
const aad = { userId: 'user-1', provider: 'openai', credentialId: 'row-1' };
const API_KEY = 'sk-live-EXTREMEMENT-SECRETE-123456';

const seal = () => encryptApiKey({ apiKey: API_KEY, kek: kekA, kekVersion: 'v1', aad });
const openText = async (envelope: Awaited<ReturnType<typeof seal>>, kek = kekA, useAad = aad) => {
  const bytes = await decryptApiKey({ envelope, kek, aad: useAad });
  try {
    return new TextDecoder().decode(bytes);
  } finally {
    zeroize(bytes);
  }
};

describe('BYOK envelope crypto — roundtrip and fail-closed binding', () => {
  it('roundtrips the API key and never stores it in clear in the envelope', async () => {
    const envelope = await seal();
    await expect(openText(envelope)).resolves.toBe(API_KEY);
    for (const value of Object.values(envelope)) {
      expect(value).not.toContain(API_KEY);
      expect(value).not.toContain('SECRETE');
    }
  });

  it('fails closed for the WRONG USER (AAD userId binding)', async () => {
    const envelope = await seal();
    await expect(openText(envelope, kekA, { ...aad, userId: 'user-2' })).rejects.toThrow();
  });

  it('fails closed for the WRONG PROVIDER (AAD provider binding)', async () => {
    const envelope = await seal();
    await expect(openText(envelope, kekA, { ...aad, provider: 'anthropic' })).rejects.toThrow();
  });

  it('fails closed when moved to ANOTHER ROW (AAD credentialId binding)', async () => {
    const envelope = await seal();
    await expect(openText(envelope, kekA, { ...aad, credentialId: 'row-2' })).rejects.toThrow();
  });

  it('fails closed under the WRONG KEK', async () => {
    const envelope = await seal();
    await expect(openText(envelope, kekB)).rejects.toThrow();
  });

  it('fails closed when the kekVersion FIELD is tampered (version is in the AAD)', async () => {
    const envelope = await seal();
    await expect(openText({ ...envelope, kekVersion: 'v2' })).rejects.toThrow();
  });

  it('fails closed on tamper of EVERY envelope field', async () => {
    const envelope = await seal();
    const flip = (b64: string) => (b64.startsWith('A') ? `B${b64.slice(1)}` : `A${b64.slice(1)}`);
    for (const field of ['ciphertext', 'iv', 'wrappedDek', 'wrapIv'] as const) {
      await expect(
        openText({ ...envelope, [field]: flip(envelope[field]) }),
        field,
      ).rejects.toThrow();
    }
  });

  it("fails closed on a ROW SWAP: user B's AAD cannot open a mix of A's fields", async () => {
    // Two rows of the same user/provider: swapping the wrapped DEK between
    // rows (a plausible DB-level splice) must fail on either AAD.
    const rowA = await seal();
    const rowB = await encryptApiKey({
      apiKey: 'sk-autre-cle-999999',
      kek: kekA,
      kekVersion: 'v1',
      aad: { ...aad, credentialId: 'row-2' },
    });
    const spliced = { ...rowA, wrappedDek: rowB.wrappedDek, wrapIv: rowB.wrapIv };
    await expect(openText(spliced, kekA, aad)).rejects.toThrow();
    await expect(openText(spliced, kekA, { ...aad, credentialId: 'row-2' })).rejects.toThrow();
  });

  it('uses DISTINCT random IVs: sealing twice never repeats iv/wrapIv/ciphertext', async () => {
    const a = await seal();
    const b = await seal();
    expect(a.iv).not.toBe(b.iv);
    expect(a.wrapIv).not.toBe(b.wrapIv);
    expect(a.iv).not.toBe(a.wrapIv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe('fixed-length payload — the envelope reveals NOTHING about the key length', () => {
  it('an 8-byte key and a maximum-size key produce the SAME ciphertext length', async () => {
    const tiny = await encryptApiKey({ apiKey: 'sk-12345', kek: kekA, kekVersion: 'v1', aad });
    const huge = await encryptApiKey({
      apiKey: 'x'.repeat(MAX_API_KEY_BYTES),
      kek: kekA,
      kekVersion: 'v1',
      aad,
    });
    expect(tiny.ciphertext.length).toBe(huge.ciphertext.length);
    expect(tiny.wrappedDek.length).toBe(huge.wrappedDek.length);
    // And both roundtrip.
    await expect(openText(tiny)).resolves.toBe('sk-12345');
    await expect(openText(huge)).resolves.toBe('x'.repeat(MAX_API_KEY_BYTES));
  });

  it('bounds the key in BYTES (UTF-8), not JS string length', async () => {
    // 2048 'é' = 4096 bytes → accepted; 2049 'é' = 4098 bytes → refused even
    // though the STRING length (2049) is far under the byte bound.
    const okKey = 'é'.repeat(MAX_API_KEY_BYTES / 2);
    const envelope = await encryptApiKey({ apiKey: okKey, kek: kekA, kekVersion: 'v1', aad });
    await expect(openText(envelope)).resolves.toBe(okKey);
    await expect(
      encryptApiKey({
        apiKey: 'é'.repeat(MAX_API_KEY_BYTES / 2 + 1),
        kek: kekA,
        kekVersion: 'v1',
        aad,
      }),
    ).rejects.toThrow(/bytes/);
    await expect(
      encryptApiKey({
        apiKey: 'x'.repeat(MAX_API_KEY_BYTES + 1),
        kek: kekA,
        kekVersion: 'v1',
        aad,
      }),
    ).rejects.toThrow(/bytes/);
    await expect(encryptApiKey({ apiKey: '', kek: kekA, kekVersion: 'v1', aad })).rejects.toThrow(
      /bytes/,
    );
  });
});

describe('BYOK KEK rotation (rewrapEnvelope) — TRUE rewrap', () => {
  it('preserves ciphertext+iv VERBATIM (the API key is never decrypted) and rebinds the wrap', async () => {
    const envelope = await seal();
    const rotated = await rewrapEnvelope({
      envelope,
      oldKek: kekA,
      newKek: kekB,
      newKekVersion: 'v2',
      aad,
    });
    // The key payload is untouched — only the DEK wrap changes.
    expect(rotated.ciphertext).toBe(envelope.ciphertext);
    expect(rotated.iv).toBe(envelope.iv);
    expect(rotated.wrappedDek).not.toBe(envelope.wrappedDek);
    expect(rotated.wrapIv).not.toBe(envelope.wrapIv);
    expect(rotated.kekVersion).toBe('v2');
    // Only the NEW KEK opens the rotated envelope.
    await expect(openText(rotated, kekB)).resolves.toBe(API_KEY);
    await expect(openText(rotated, kekA)).rejects.toThrow();
    // The pre-rotation envelope still opens with the old KEK — replacement is
    // the DB layer's atomic job, not a crypto side effect.
    await expect(openText(envelope, kekA)).resolves.toBe(API_KEY);
  });

  it('refuses to rewrap with a wrong old KEK', async () => {
    const envelope = await seal();
    await expect(
      rewrapEnvelope({ envelope, oldKek: kekB, newKek: kekB, newKekVersion: 'v2', aad }),
    ).rejects.toThrow();
  });

  it('a rotated wrap cannot be replayed under the OLD version label', async () => {
    const envelope = await seal();
    const rotated = await rewrapEnvelope({
      envelope,
      oldKek: kekA,
      newKek: kekB,
      newKekVersion: 'v2',
      aad,
    });
    // Forging the version back to v1 breaks the wrap AAD.
    await expect(openText({ ...rotated, kekVersion: 'v1' }, kekB)).rejects.toThrow();
  });
});

describe('decodeKek — deployment secret validation', () => {
  it('decodes a base64url secret of exactly 32 bytes (with -/_ characters)', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i * 37 + 251) % 256);
    const secret = Buffer.from(bytes).toString('base64url');
    expect(Array.from(decodeKek(secret))).toEqual(Array.from(bytes));
  });

  it('rejects a secret that is not exactly 32 bytes', () => {
    expect(() => decodeKek(Buffer.from(new Uint8Array(31)).toString('base64url'))).toThrow(
      /32 bytes/,
    );
    expect(() => decodeKek(Buffer.from(new Uint8Array(33)).toString('base64url'))).toThrow(
      /32 bytes/,
    );
  });

  it('rejects garbage that is not base64url', () => {
    expect(() => decodeKek('!!!not-base64url!!!')).toThrow();
  });
});

describe('decodeKekRing — deployment-owned key ring', () => {
  const secretV1 = Buffer.from(new Uint8Array(32).fill(1)).toString('base64url');
  const secretV2 = Buffer.from(new Uint8Array(32).fill(2)).toString('base64url');

  it('defaults the active version to v1 for compatibility', () => {
    const ring = decodeKekRing({ RETA_BYOK_KEK_V1: secretV1 });
    expect(ring?.activeVersion).toBe('v1');
    expect(Array.from(ring!.keys.keys())).toEqual(['v1']);
  });

  it('activates v2 explicitly while still holding v1 (rotation window)', () => {
    const ring = decodeKekRing({
      RETA_BYOK_KEK_V1: secretV1,
      RETA_BYOK_KEK_V2: secretV2,
      RETA_BYOK_KEK_ACTIVE: 'v2',
    });
    expect(ring?.activeVersion).toBe('v2');
    expect(Array.from(ring!.keys.keys()).sort()).toEqual(['v1', 'v2']);
  });

  it('fails CLOSED (null) when the active version has no secret, when a secret is malformed, or when empty', () => {
    expect(decodeKekRing({ RETA_BYOK_KEK_V1: secretV1, RETA_BYOK_KEK_ACTIVE: 'v2' })).toBeNull();
    expect(decodeKekRing({ RETA_BYOK_KEK_V1: 'garbage!!' })).toBeNull();
    expect(decodeKekRing({})).toBeNull();
  });
});

describe('zeroize', () => {
  it('overwrites every byte', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    zeroize(bytes);
    expect(Array.from(bytes)).toEqual([0, 0, 0, 0]);
  });
});
