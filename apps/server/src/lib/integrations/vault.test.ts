import {
  IntegrationVaultError,
  isIntegrationVaultConfigured,
  openIntegrationSecret,
  sealIntegrationSecret,
} from './vault';
import { describe, expect, it } from 'vitest';

const KEK_V1 = Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i)).toString('base64url');
const KEK_V2 = Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => 31 - i)).toString('base64url');
const RING = { RETA_BYOK_KEK_V1: KEK_V1 };
const SCOPE = { teamId: 'team-1', purpose: 'linear:access', recordId: 'install-1' };

describe('vault des secrets d’intégration — enveloppe scellée, fail closed', () => {
  it('scelle puis rouvre un token — le plaintext ne survit que dans le retour', async () => {
    const sealed = await sealIntegrationSecret(RING, SCOPE, 'lin_api_token_123');
    expect(sealed.ciphertext).not.toContain('lin_api_token_123');
    expect(sealed.kekVersion).toBe('v1');
    await expect(openIntegrationSecret(RING, SCOPE, sealed)).resolves.toBe('lin_api_token_123');
  });

  it('la PORTÉE est liante (AAD) : autre équipe, autre usage ou autre ligne → refus uniforme', async () => {
    const sealed = await sealIntegrationSecret(RING, SCOPE, 'secret');
    for (const scope of [
      { ...SCOPE, teamId: 'team-2' },
      { ...SCOPE, purpose: 'linear:refresh' },
      { ...SCOPE, recordId: 'install-2' },
    ]) {
      await expect(openIntegrationSecret(RING, scope, sealed)).rejects.toThrow(
        'integration_vault_unavailable',
      );
    }
  });

  it('ring ABSENT ou malformé → fail closed, jamais un fallback en clair', async () => {
    expect(isIntegrationVaultConfigured({})).toBe(false);
    expect(isIntegrationVaultConfigured({ RETA_BYOK_KEK_V1: 'pas-du-base64url-valide!!' })).toBe(
      false,
    );
    await expect(sealIntegrationSecret({}, SCOPE, 'secret')).rejects.toThrow(IntegrationVaultError);
    const sealed = await sealIntegrationSecret(RING, SCOPE, 'secret');
    await expect(openIntegrationSecret({}, SCOPE, sealed)).rejects.toThrow(
      'integration_vault_unavailable',
    );
  });

  it('une enveloppe v2 s’ouvre avec la clé v2 du ring, jamais avec la v1', async () => {
    const ringV2 = {
      RETA_BYOK_KEK_V1: KEK_V1,
      RETA_BYOK_KEK_V2: KEK_V2,
      RETA_BYOK_KEK_ACTIVE: 'v2',
    };
    const sealed = await sealIntegrationSecret(ringV2, SCOPE, 'secret-v2');
    expect(sealed.kekVersion).toBe('v2');
    await expect(openIntegrationSecret(ringV2, SCOPE, sealed)).resolves.toBe('secret-v2');
    // Ring sans la v2 : l'enveloppe est inerte.
    await expect(openIntegrationSecret(RING, SCOPE, sealed)).rejects.toThrow(
      'integration_vault_unavailable',
    );
  });
});
