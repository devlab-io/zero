/**
 * Ask Reta BYOK envelope encryption (slice 3A) — WebCrypto AES-GCM.
 *
 * Envelope format v1, FIXED-LENGTH payload: the API key is framed as
 * `uint32 byte-length + key bytes + random padding` inside a constant
 * 8192-byte plaintext, so EVERY admissible key produces exactly the same
 * ciphertext length — the stored envelope reveals nothing about the key's
 * length. The bound is enforced in BYTES (UTF-8), never string length.
 *
 * A random 32-byte DEK encrypts that payload; the deployment KEK (Worker
 * secret, base64url of EXACTLY 32 bytes) wraps the DEK. Distinct 96-bit IVs.
 * AADs are SPLIT so rotation never touches the key material:
 * - payload AAD: formatVersion + userId + provider + credential row id
 *   (KEK-independent — the key ciphertext survives KEK rotation verbatim);
 * - wrap AAD: the same, PLUS the kekVersion (a wrapped DEK cannot be replayed
 *   under another KEK version).
 * `rewrapEnvelope` unwraps the existing DEK under the old KEK and wraps the
 * SAME DEK under the new one (fresh wrap IV) — ciphertext and iv are
 * preserved and the API key is NEVER decrypted during rotation.
 * No plaintext is ever cached; decrypt returns BYTES so callers can zeroize.
 */

export type ByokEnvelope = {
  ciphertext: string; // base64, constant length (fixed payload)
  iv: string; // base64, 96-bit
  wrappedDek: string; // base64
  wrapIv: string; // base64, 96-bit
  kekVersion: string;
};

export type ByokAad = {
  userId: string;
  provider: string;
  credentialId: string;
};

/** Initial KEK version label — the ring's default active version. */
export const RETA_BYOK_KEK_VERSION = 'v1';

/**
 * Deployment-owned KEK ring (operational rotation, release-fix 3A).
 * Secrets: RETA_BYOK_KEK_V1 / RETA_BYOK_KEK_V2 (each base64url, exactly
 * 32 bytes) + RETA_BYOK_KEK_ACTIVE naming the version NEW envelopes are
 * wrapped under (default 'v1' for compatibility). The runtime can OPEN any
 * version present in the ring and lazily rewraps rows to the active one
 * (see runbook docs/runbooks/reta-byok-kek-rotation.md). A ring whose active
 * version has no secret is a misconfiguration → null → vault fails closed
 * (Workers models unaffected).
 */
export type KekRingSecrets = {
  RETA_BYOK_KEK_V1?: string;
  RETA_BYOK_KEK_V2?: string;
  RETA_BYOK_KEK_ACTIVE?: string;
};

export type KekRing = {
  activeVersion: string;
  /** Decoded keys by version — caller MUST zeroizeKekRing() when done. */
  keys: Map<string, Uint8Array>;
};

export function decodeKekRing(secrets: KekRingSecrets): KekRing | null {
  const keys = new Map<string, Uint8Array>();
  try {
    if (secrets.RETA_BYOK_KEK_V1) keys.set('v1', decodeKek(secrets.RETA_BYOK_KEK_V1));
    if (secrets.RETA_BYOK_KEK_V2) keys.set('v2', decodeKek(secrets.RETA_BYOK_KEK_V2));
  } catch {
    // A malformed secret poisons the whole ring: fail closed, zeroize what
    // was already decoded.
    for (const key of keys.values()) zeroize(key);
    return null;
  }
  if (keys.size === 0) return null;
  const activeVersion = secrets.RETA_BYOK_KEK_ACTIVE || RETA_BYOK_KEK_VERSION;
  if (!keys.has(activeVersion)) {
    for (const key of keys.values()) zeroize(key);
    return null;
  }
  return { activeVersion, keys };
}

export function zeroizeKekRing(ring: KekRing): void {
  for (const key of ring.keys.values()) zeroize(key);
}

const FORMAT_VERSION = 1;
const PAYLOAD_BYTES = 8192;
const LENGTH_PREFIX_BYTES = 4;
/** Hard bound on the key itself, in BYTES (UTF-8) — not JS string length. */
export const MAX_API_KEY_BYTES = 4096;
const KEK_BYTES = 32;
const DEK_BYTES = 32;
const IV_BYTES = 12;

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Decode + validate the deployment KEK secret: base64url, EXACTLY 32 bytes. */
export function decodeKek(secret: string): Uint8Array {
  const normalized = secret.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(padded);
  } catch {
    throw new Error('RETA_BYOK_KEK: invalid base64url');
  }
  if (bytes.byteLength !== KEK_BYTES) {
    throw new Error(`RETA_BYOK_KEK: expected exactly ${KEK_BYTES} bytes`);
  }
  return bytes;
}

/** KEK-independent binding of the key payload (survives rotation verbatim). */
const payloadAad = (aad: ByokAad): Uint8Array =>
  encoder.encode(
    `reta-byok:fmt${FORMAT_VERSION}:${aad.userId}:${aad.provider}:${aad.credentialId}`,
  );

/** Wrap binding ADDS the kekVersion: a wrapped DEK is pinned to its KEK. */
const wrapAad = (kekVersion: string, aad: ByokAad): Uint8Array =>
  encoder.encode(
    `reta-byok:fmt${FORMAT_VERSION}:kek=${kekVersion}:${aad.userId}:${aad.provider}:${aad.credentialId}`,
  );

const importAesKey = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);

export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}

/** Frame the key into the constant-size payload: uint32 length + bytes + random pad. */
function buildFixedPayload(apiKey: string): Uint8Array {
  const keyBytes = encoder.encode(apiKey);
  if (keyBytes.byteLength === 0 || keyBytes.byteLength > MAX_API_KEY_BYTES) {
    zeroize(keyBytes);
    throw new Error(`BYOK key must be 1..${MAX_API_KEY_BYTES} bytes`);
  }
  const payload = new Uint8Array(PAYLOAD_BYTES);
  crypto.getRandomValues(payload); // padding is random, not zeros
  new DataView(payload.buffer, payload.byteOffset).setUint32(0, keyBytes.byteLength);
  payload.set(keyBytes, LENGTH_PREFIX_BYTES);
  zeroize(keyBytes);
  return payload;
}

/** Fail-closed parse: wrong size, zero/oversize or truncated length all throw. */
function parseFixedPayload(payload: Uint8Array): Uint8Array {
  if (payload.byteLength !== PAYLOAD_BYTES) {
    throw new Error('BYOK payload: invalid size');
  }
  const length = new DataView(payload.buffer, payload.byteOffset).getUint32(0);
  if (length === 0 || length > MAX_API_KEY_BYTES || LENGTH_PREFIX_BYTES + length > PAYLOAD_BYTES) {
    throw new Error('BYOK payload: invalid length');
  }
  return payload.slice(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length);
}

export async function encryptApiKey(params: {
  apiKey: string;
  kek: Uint8Array;
  kekVersion: string;
  aad: ByokAad;
}): Promise<ByokEnvelope> {
  const dek = crypto.getRandomValues(new Uint8Array(DEK_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const wrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const payload = buildFixedPayload(params.apiKey);
  try {
    const dekKey = await importAesKey(dek);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv as BufferSource,
          additionalData: payloadAad(params.aad) as BufferSource,
        },
        dekKey,
        payload as BufferSource,
      ),
    );
    const kekKey = await importAesKey(params.kek);
    const wrappedDek = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: wrapIv as BufferSource,
          additionalData: wrapAad(params.kekVersion, params.aad) as BufferSource,
        },
        kekKey,
        dek as BufferSource,
      ),
    );
    return {
      ciphertext: toBase64(ciphertext),
      iv: toBase64(iv),
      wrappedDek: toBase64(wrappedDek),
      wrapIv: toBase64(wrapIv),
      kekVersion: params.kekVersion,
    };
  } finally {
    zeroize(dek);
    zeroize(payload);
  }
}

/** Unwrap the DEK — shared by decrypt and rewrap; caller MUST zeroize it. */
async function unwrapDek(envelope: ByokEnvelope, kek: Uint8Array, aad: ByokAad) {
  const kekKey = await importAesKey(kek);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(envelope.wrapIv) as BufferSource,
        additionalData: wrapAad(envelope.kekVersion, aad) as BufferSource,
      },
      kekKey,
      fromBase64(envelope.wrappedDek) as BufferSource,
    ),
  );
}

/** Returns the API key BYTES — the caller decodes and MUST zeroize them. */
export async function decryptApiKey(params: {
  envelope: ByokEnvelope;
  kek: Uint8Array;
  aad: ByokAad;
}): Promise<Uint8Array> {
  const dek = await unwrapDek(params.envelope, params.kek, params.aad);
  try {
    const dekKey = await importAesKey(dek);
    const payload = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: fromBase64(params.envelope.iv) as BufferSource,
          additionalData: payloadAad(params.aad) as BufferSource,
        },
        dekKey,
        fromBase64(params.envelope.ciphertext) as BufferSource,
      ),
    );
    try {
      return parseFixedPayload(payload);
    } finally {
      zeroize(payload);
    }
  } finally {
    zeroize(dek);
  }
}

/**
 * KEK rotation, TRUE rewrap: unwrap the existing DEK under the old KEK, wrap
 * the SAME DEK under the new KEK (fresh wrap IV, wrap AAD bound to the NEW
 * version). The key payload ciphertext and its iv are preserved verbatim —
 * the API key is NEVER decrypted, decoded or re-encrypted here.
 */
export async function rewrapEnvelope(params: {
  envelope: ByokEnvelope;
  oldKek: Uint8Array;
  newKek: Uint8Array;
  newKekVersion: string;
  aad: ByokAad;
}): Promise<ByokEnvelope> {
  const dek = await unwrapDek(params.envelope, params.oldKek, params.aad);
  try {
    const newWrapIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const newKekKey = await importAesKey(params.newKek);
    const wrappedDek = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: newWrapIv as BufferSource,
          additionalData: wrapAad(params.newKekVersion, params.aad) as BufferSource,
        },
        newKekKey,
        dek as BufferSource,
      ),
    );
    return {
      ciphertext: params.envelope.ciphertext,
      iv: params.envelope.iv,
      wrappedDek: toBase64(wrappedDek),
      wrapIv: toBase64(newWrapIv),
      kekVersion: params.newKekVersion,
    };
  } finally {
    zeroize(dek);
  }
}
