/**
 * Vault des secrets d'intégration (P18) — RÉUTILISE la construction d'enveloppe
 * BYOK (AES-GCM, DEK aléatoire, ring KEK du déploiement, AAD scindés) : même
 * ring de secrets Worker (RETA_BYOK_KEK_*), AAD scopés intégration. Ring absent
 * ou malformé → FAIL CLOSED (`integration_vault_unavailable`) — le reste de
 * l'app n'est jamais bloqué, seule la fonctionnalité intégration l'est, et
 * l'UI owner explique la configuration manquante. Aucun secret n'est loggé ni
 * renvoyé ; seule sa PRÉSENCE (booléen) est exposée.
 */
import {
  decodeKekRing,
  decryptApiKey,
  encryptApiKey,
  zeroize,
  zeroizeKekRing,
  type ByokEnvelope,
  type KekRingSecrets,
} from '../ask-reta/byok-crypto';
import type { SealedSecret } from '../teams/team-integrations-shared';

export class IntegrationVaultError extends Error {
  constructor() {
    super('integration_vault_unavailable');
    this.name = 'IntegrationVaultError';
  }
}

/**
 * Portée d'un secret : le déchiffrement échoue si la portée ne correspond pas
 * exactement (AAD) — une enveloppe volée d'une autre table/équipe est inerte.
 */
export type IntegrationSecretScope = {
  teamId: string;
  /** ex. 'linear:access', 'linear:refresh', 'linear:pkce', 'outbound:secret'. */
  purpose: string;
  recordId: string;
};

const scopeToAad = (scope: IntegrationSecretScope) => ({
  userId: `team:${scope.teamId}`,
  provider: `integration:${scope.purpose}`,
  credentialId: scope.recordId,
});

export function isIntegrationVaultConfigured(secrets: KekRingSecrets): boolean {
  const ring = decodeKekRing(secrets);
  if (!ring) return false;
  zeroizeKekRing(ring);
  return true;
}

export async function sealIntegrationSecret(
  secrets: KekRingSecrets,
  scope: IntegrationSecretScope,
  plaintext: string,
): Promise<SealedSecret> {
  const ring = decodeKekRing(secrets);
  if (!ring) throw new IntegrationVaultError();
  try {
    const kek = ring.keys.get(ring.activeVersion);
    if (!kek) throw new IntegrationVaultError();
    const envelope = await encryptApiKey({
      apiKey: plaintext,
      kek,
      kekVersion: ring.activeVersion,
      aad: scopeToAad(scope),
    });
    return envelope;
  } finally {
    zeroizeKekRing(ring);
  }
}

export async function openIntegrationSecret(
  secrets: KekRingSecrets,
  scope: IntegrationSecretScope,
  sealed: SealedSecret,
): Promise<string> {
  const ring = decodeKekRing(secrets);
  if (!ring) throw new IntegrationVaultError();
  try {
    const kek = ring.keys.get(sealed.kekVersion);
    if (!kek) throw new IntegrationVaultError();
    const bytes = await decryptApiKey({
      envelope: sealed as ByokEnvelope,
      kek,
      aad: scopeToAad(scope),
    });
    try {
      return new TextDecoder().decode(bytes);
    } finally {
      zeroize(bytes);
    }
  } catch (error) {
    if (error instanceof IntegrationVaultError) throw error;
    // AAD/version/intégrité : tout échec de déchiffrement est un fail closed
    // uniforme — jamais de détail exploitable.
    throw new IntegrationVaultError();
  } finally {
    zeroizeKekRing(ring);
  }
}
