import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { retaByokCredential } from './schema';
import { DbRpcDO } from './durable-objects';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// P0 vault storage (slice 3A): strict column contract (NO key hint of any
// kind), user-scoped access that is STRUCTURAL, and the migration itself.

describe('mail0_reta_byok_credential — strict column contract', () => {
  const config = getTableConfig(retaByokCredential);

  it('has EXACTLY the contract columns — no suffix/length/prefix hint, no plaintext slot', () => {
    expect(config.columns.map((column) => column.name).sort()).toEqual(
      [
        'id',
        'user_id',
        'provider',
        'ciphertext',
        'iv',
        'wrapped_dek',
        'wrap_iv',
        'kek_version',
        'consent_version',
        'created_at',
        'updated_at',
      ].sort(),
    );
  });

  it('is unique per (user, provider) and cascades away with the user', () => {
    const unique = config.uniqueConstraints.find(
      (constraint) => constraint.name === 'reta_byok_credential_user_provider_unique',
    );
    expect(unique?.columns.map((column) => column.name)).toEqual(['user_id', 'provider']);
    const fk = config.foreignKeys[0]?.reference();
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(fk?.foreignTable && getTableConfig(fk.foreignTable).name).toBe('mail0_user');
  });

  it('the generated migration matches: cascade FK, unique pair, and NO key hint column', () => {
    const sql = readFileSync(
      fileURLToPath(new URL('./migrations/0040_fixed_wallop.sql', import.meta.url).href),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "mail0_reta_byok_credential"');
    expect(sql).toContain('UNIQUE("user_id","provider")');
    expect(sql).toContain('ON DELETE cascade');
    expect(sql).not.toMatch(/key_suffix|key_length|key_prefix|key_hint/);
  });
});

describe('DbRpcDO vault façade — user scoping is STRUCTURAL', () => {
  const makeFacade = (userId: string) => {
    const mainDo = {
      findRetaByokCredential: vi.fn(async () => undefined),
      listRetaByokCredentialStatus: vi.fn(async () => []),
      replaceRetaByokCredential: vi.fn(async () => {}),
      deleteRetaByokCredentialAndResetModel: vi.fn(async () => {}),
      selectRetaModel: vi.fn(async () => ({ ok: true as const })),
      rewrapRetaByokCredential: vi.fn(async () => true),
    };
    return { mainDo, facade: new DbRpcDO(mainDo as never, userId) };
  };

  it('every vault method injects ITS OWN userId — there is no parameter to name another user', async () => {
    const { mainDo, facade } = makeFacade('user-a');
    await facade.findRetaByokCredential('openai');
    expect(mainDo.findRetaByokCredential).toHaveBeenCalledWith('user-a', 'openai');

    await facade.listRetaByokCredentialStatus();
    expect(mainDo.listRetaByokCredentialStatus).toHaveBeenCalledWith('user-a');

    const envelope = {
      id: 'row-1',
      provider: 'openai',
      ciphertext: 'c',
      iv: 'i',
      wrappedDek: 'w',
      wrapIv: 'wi',
      kekVersion: 'v1',
      consentVersion: '2026-08-01',
    };
    await facade.replaceRetaByokCredential(envelope);
    expect(mainDo.replaceRetaByokCredential).toHaveBeenCalledWith('user-a', envelope);

    await facade.deleteRetaByokCredentialAndResetModel('openai', ['openai:gpt-5.2'], 'fallback');
    expect(mainDo.deleteRetaByokCredentialAndResetModel).toHaveBeenCalledWith(
      'user-a',
      'openai',
      ['openai:gpt-5.2'],
      'fallback',
    );

    const selectParams = {
      modelId: 'openai:gpt-5.2',
      provider: 'openai',
      requiredConsentVersion: '2026-08-01',
      supportedKekVersions: ['v1'],
    };
    await facade.selectRetaModel(selectParams);
    expect(mainDo.selectRetaModel).toHaveBeenCalledWith('user-a', selectParams);

    const casParams = {
      id: 'row-1',
      expectedKekVersion: 'v1',
      wrappedDek: 'w2',
      wrapIv: 'wi2',
      kekVersion: 'v2',
    };
    await facade.rewrapRetaByokCredential('openai', casParams);
    expect(mainDo.rewrapRetaByokCredential).toHaveBeenCalledWith('user-a', 'openai', casParams);
  });

  it("two façades never cross: A's calls carry user-a, B's carry user-b", async () => {
    const a = makeFacade('user-a');
    const b = makeFacade('user-b');
    await a.facade.findRetaByokCredential('anthropic');
    await b.facade.findRetaByokCredential('anthropic');
    expect(a.mainDo.findRetaByokCredential).toHaveBeenCalledWith('user-a', 'anthropic');
    expect(b.mainDo.findRetaByokCredential).toHaveBeenCalledWith('user-b', 'anthropic');
  });
});
