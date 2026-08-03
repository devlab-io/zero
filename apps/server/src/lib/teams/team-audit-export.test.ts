import { canonicalJson, signAuditExport, verifyAuditExport } from './team-audit-export';
import type { AuditExportPayload, SignedAuditExport } from './team-governance-shared';
import { describe, expect, it } from 'vitest';

const kek = (fill: number) => Buffer.from(new Uint8Array(32).fill(fill)).toString('base64url');
const RING = { RETA_BYOK_KEK_V1: kek(7), RETA_BYOK_KEK_ACTIVE: 'v1' };

const payload = (overrides: Partial<AuditExportPayload> = {}): AuditExportPayload => ({
  format: 'reta-team-audit-export',
  version: 1,
  teamId: 'team-1',
  teamName: 'Support',
  requestedByUserId: 'u-owner',
  range: { from: null, to: null },
  generatedAt: '2026-08-03T00:00:00.000Z',
  entryCount: 1,
  truncated: false,
  entries: [
    {
      id: 'a1',
      action: 'thread.shared',
      subjectType: 'team_thread',
      subjectId: 'tt1',
      metadata: { threadId: 'x' },
      createdAt: '2026-08-01T10:00:00.000Z',
      actorUserId: 'u-owner',
      actorKind: 'user',
      actorName: 'Owner',
    },
  ],
  ...overrides,
});

describe('canonicalJson', () => {
  it('trie les clés récursivement — deux ordres d’insertion, mêmes octets', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }),
    );
  });
  it('préserve l’ordre des tableaux et omet les undefined d’objets', () => {
    expect(canonicalJson([2, 1])).toBe('[2,1]');
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('signAuditExport / verifyAuditExport', () => {
  it('aller-retour valide, version du KEK embarquée', async () => {
    const doc = await signAuditExport(RING, payload());
    expect(doc).not.toBeNull();
    expect(doc!.signature.kekVersion).toBe('v1');
    const verdict = await verifyAuditExport(RING, doc!);
    expect(verdict).toEqual({ valid: true, kekVersion: 'v1' });
  });

  it('toute altération du payload invalide la signature', async () => {
    const doc = (await signAuditExport(RING, payload()))!;
    const tampered: SignedAuditExport = {
      ...doc,
      payload: {
        ...doc.payload,
        entries: [{ ...doc.payload.entries[0]!, action: 'thread.unshared' }],
      },
    };
    expect(await verifyAuditExport(RING, tampered)).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it('réordonner les clés du payload NE casse PAS la vérification (canonique)', async () => {
    const doc = (await signAuditExport(RING, payload()))!;
    // Round-trip JSON avec un ordre de clés différent.
    const reordered = JSON.parse(
      JSON.stringify({ signature: doc.signature, payload: { ...doc.payload } }),
    ) as SignedAuditExport;
    expect((await verifyAuditExport(RING, reordered))?.valid).toBe(true);
  });

  it('rotation : un export v1 se vérifie encore quand v2 devient active', async () => {
    const doc = (await signAuditExport(RING, payload()))!;
    const rotated = {
      RETA_BYOK_KEK_V1: RING.RETA_BYOK_KEK_V1,
      RETA_BYOK_KEK_V2: kek(9),
      RETA_BYOK_KEK_ACTIVE: 'v2',
    };
    expect((await verifyAuditExport(rotated, doc))?.valid).toBe(true);
    // Nouveau document signé sous v2.
    const doc2 = (await signAuditExport(rotated, payload()))!;
    expect(doc2.signature.kekVersion).toBe('v2');
  });

  it('version de KEK absente du ring → unknown_kek_version', async () => {
    const doc = (await signAuditExport(RING, payload()))!;
    const v2Only = { RETA_BYOK_KEK_V2: kek(9), RETA_BYOK_KEK_ACTIVE: 'v2' };
    expect(await verifyAuditExport(v2Only, doc)).toEqual({
      valid: false,
      reason: 'unknown_kek_version',
    });
  });

  it('sans ring : fail closed (null), jamais un document non signé', async () => {
    expect(await signAuditExport({}, payload())).toBeNull();
    const doc = (await signAuditExport(RING, payload()))!;
    expect(await verifyAuditExport({}, doc)).toBeNull();
  });

  it('MAC malformée → malformed, pas d’exception', async () => {
    const doc = (await signAuditExport(RING, payload()))!;
    const broken = { ...doc, signature: { ...doc.signature, mac: '@@not-base64@@' } };
    expect(await verifyAuditExport(RING, broken)).toEqual({ valid: false, reason: 'malformed' });
  });
});
