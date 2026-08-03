/**
 * Export SIGNÉ du journal d'audit (P17-B). La clé de signature est DÉRIVÉE du
 * KEK ring serveur (RETA_BYOK_KEK_*) par HKDF-SHA256 avec une info dédiée —
 * jamais le KEK brut, jamais une clé partagée avec le scellement BYOK. Le
 * document embarque la version du KEK : après rotation, un export ancien se
 * vérifie tant que sa version reste dans le ring. Sans ring configuré, la
 * fonctionnalité FAIL CLOSED (export_unavailable) sans toucher au reste.
 *
 * La MAC couvre la sérialisation CANONIQUE du payload : clés d'objets triées
 * récursivement, aucun espace. Deux sérialisations du même contenu logique
 * produisent donc les mêmes octets — la vérification ne dépend pas de l'ordre
 * d'insertion des clés côté producteur.
 */
import type {
  AuditExportPayload,
  AuditExportVerdict,
  SignedAuditExport,
} from './team-governance-shared';
import { decodeKekRing, zeroizeKekRing, type KekRingSecrets } from '../ask-reta/byok-crypto';

const HKDF_INFO = 'reta:team-audit-export:v1';
const encoder = new TextEncoder();

/** JSON canonique : clés triées récursivement, tableaux préservés. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // JSON.stringify omet les undefined dans les objets — le canonique aussi.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

/** Clé HMAC dérivée d'un KEK du ring — importée non extractable. */
async function deriveMacKey(kek: Uint8Array, usages: ('sign' | 'verify')[]): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', kek as BufferSource, 'HKDF', false, [
    'deriveKey',
  ]);
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode(HKDF_INFO),
    },
    hkdfKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

/**
 * Signe un payload d'export avec la version ACTIVE du ring.
 * Retourne null si le ring est absent ou mal configuré (fail closed).
 */
export async function signAuditExport(
  secrets: KekRingSecrets,
  payload: AuditExportPayload,
): Promise<SignedAuditExport | null> {
  const ring = decodeKekRing(secrets);
  if (!ring) return null;
  try {
    const kek = ring.keys.get(ring.activeVersion);
    if (!kek) return null;
    const key = await deriveMacKey(kek, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalJson(payload)));
    return {
      payload,
      signature: {
        algorithm: 'HMAC-SHA256',
        kdf: 'HKDF-SHA256',
        kekVersion: ring.activeVersion,
        mac: toBase64Url(new Uint8Array(mac)),
      },
    };
  } finally {
    zeroizeKekRing(ring);
  }
}

/**
 * Vérifie un document exporté contre le ring courant. `crypto.subtle.verify`
 * est en temps constant — jamais de comparaison de chaînes sur la MAC.
 */
export async function verifyAuditExport(
  secrets: KekRingSecrets,
  doc: SignedAuditExport,
): Promise<AuditExportVerdict | null> {
  const ring = decodeKekRing(secrets);
  if (!ring) return null;
  try {
    if (
      doc.signature.algorithm !== 'HMAC-SHA256' ||
      doc.signature.kdf !== 'HKDF-SHA256' ||
      typeof doc.signature.mac !== 'string'
    ) {
      return { valid: false, reason: 'malformed' };
    }
    const kek = ring.keys.get(doc.signature.kekVersion);
    if (!kek) return { valid: false, reason: 'unknown_kek_version' };
    let macBytes: Uint8Array;
    try {
      const normalized = doc.signature.mac.replaceAll('-', '+').replaceAll('_', '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const binary = atob(padded);
      macBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) macBytes[i] = binary.charCodeAt(i);
    } catch {
      return { valid: false, reason: 'malformed' };
    }
    const key = await deriveMacKey(kek, ['verify']);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      macBytes as BufferSource,
      encoder.encode(canonicalJson(doc.payload)),
    );
    return valid
      ? { valid: true, kekVersion: doc.signature.kekVersion }
      : { valid: false, reason: 'bad_signature' };
  } finally {
    zeroizeKekRing(ring);
  }
}
