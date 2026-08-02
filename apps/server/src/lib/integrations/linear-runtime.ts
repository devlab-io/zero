/**
 * Runtime Linear côté serveur (P18 durci) : fabrique un client authentifié
 * pour une installation ACTIVE — ouvre le token scellé, rafraîchit AVANT tout
 * GraphQL si l'expiration approche (rotation persistée ATOMIQUEMENT en un
 * UPDATE), et rejoue UNE seule fois sur 401 après refresh forcé — sinon FAIL
 * CLOSED. Ne loggue et n'expose JAMAIS un secret. `fetchImpl` injectable :
 * les tests ne touchent pas le réseau.
 */
import {
  exchangeAuthorizationCode,
  hashOauthState,
  refreshAccessToken,
  validateGrantedScopes,
} from './linear-oauth';
import {
  activateInstall,
  revokeLinearInstall,
  takeInstallByOauthState,
} from '../teams/team-integrations-store';
import { createLinearClient, LinearApiError, type LinearIssueClient } from './linear-client';
import { LINEAR_OAUTH_SCOPES } from '../teams/team-integrations-shared';
import { openIntegrationSecret, sealIntegrationSecret } from './vault';
import { teamIntegrationInstall, teamMember } from '../../db/schema';
import type { KekRingSecrets } from '../ask-reta/byok-crypto';
import { TeamStoreError } from '../teams/team-store';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../../db';

export type LinearRuntimeConfig = {
  kekRing: KekRingSecrets;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
};

const EXPIRY_MARGIN_MS = 60_000;

type InstallRow = typeof teamIntegrationInstall.$inferSelect;

async function loadActiveInstall(db: DB, installId: string): Promise<InstallRow> {
  const rows = await db
    .select()
    .from(teamIntegrationInstall)
    .where(eq(teamIntegrationInstall.id, installId))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== 'active' || !row.accessTokenEnvelope) {
    throw new TeamStoreError('integration_not_installed');
  }
  return row;
}

/**
 * Refresh ROTATIF avec CAS anti-concurrence (adversarial-11) : l'UPDATE est
 * FENCÉ sur l'enveloppe d'access EXACTE lue au départ — si un refresh
 * concurrent a déjà tourné, le perdant N'ÉCRASE RIEN (un ancien refresh ne
 * peut jamais remplacer un token frais) et RELIT le token du gagnant.
 * Exporté pour les tests PG de concurrence.
 */
export async function refreshInstallTokens(
  db: DB,
  config: LinearRuntimeConfig,
  row: InstallRow,
): Promise<string> {
  if (!row.refreshTokenEnvelope || !config.clientId || !config.clientSecret) {
    throw new TeamStoreError('integration_not_configured');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const refreshToken = await openIntegrationSecret(
    config.kekRing,
    { teamId: row.teamId, purpose: 'linear:refresh', recordId: row.id },
    row.refreshTokenEnvelope,
  );
  const tokens = await refreshAccessToken({
    fetchImpl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken,
  });
  const accessEnvelope = await sealIntegrationSecret(
    config.kekRing,
    { teamId: row.teamId, purpose: 'linear:access', recordId: row.id },
    tokens.accessToken,
  );
  const refreshEnvelope = tokens.refreshToken
    ? await sealIntegrationSecret(
        config.kekRing,
        { teamId: row.teamId, purpose: 'linear:refresh', recordId: row.id },
        tokens.refreshToken,
      )
    : row.refreshTokenEnvelope;
  const updated = await db
    .update(teamIntegrationInstall)
    .set({
      accessTokenEnvelope: accessEnvelope,
      refreshTokenEnvelope: refreshEnvelope,
      accessTokenExpiresAt: new Date(tokens.expiresAtMs),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(teamIntegrationInstall.id, row.id),
        // CAS : uniquement si PERSONNE n'a rafraîchi depuis notre lecture.
        eq(teamIntegrationInstall.accessTokenEnvelope, row.accessTokenEnvelope!),
      ),
    )
    .returning({ id: teamIntegrationInstall.id });
  if (!updated[0]) {
    // Course perdue : un refresh concurrent a gagné — utiliser SES tokens.
    const fresh = await loadActiveInstall(db, row.id);
    return await openIntegrationSecret(
      config.kekRing,
      { teamId: fresh.teamId, purpose: 'linear:access', recordId: fresh.id },
      fresh.accessTokenEnvelope!,
    );
  }
  return tokens.accessToken;
}

/** Proxy 401 : UNE seule relance après refresh forcé — jamais de boucle. Exporté pour tests. */
export function withSingleAuthRetry(
  initial: LinearIssueClient,
  rebuild: () => Promise<LinearIssueClient>,
): LinearIssueClient {
  let current = initial;
  let retried = false;
  const wrap = <K extends keyof LinearIssueClient>(method: K): LinearIssueClient[K] =>
    (async (...args: unknown[]) => {
      try {
        return await (current[method] as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (error) {
        if (error instanceof LinearApiError && error.kind === 'unauthorized' && !retried) {
          retried = true;
          current = await rebuild();
          return await (current[method] as (...a: unknown[]) => Promise<unknown>)(...args);
        }
        throw error;
      }
    }) as LinearIssueClient[K];
  return {
    issueCreate: wrap('issueCreate'),
    findIssueByIdentifier: wrap('findIssueByIdentifier'),
    listTeams: wrap('listTeams'),
    listWorkflowStates: wrap('listWorkflowStates'),
    listUsers: wrap('listUsers'),
    organization: wrap('organization'),
  };
}

export async function getLinearClientForInstall(
  db: DB,
  config: LinearRuntimeConfig,
  install: { id: string; teamId: string },
): Promise<LinearIssueClient> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const row = await loadActiveInstall(db, install.id);
  let accessToken = await openIntegrationSecret(
    config.kekRing,
    { teamId: row.teamId, purpose: 'linear:access', recordId: row.id },
    row.accessTokenEnvelope!,
  );
  const expiresAtMs = row.accessTokenExpiresAt?.getTime() ?? 0;
  if (expiresAtMs <= Date.now() + EXPIRY_MARGIN_MS) {
    // Refresh RÉEL avant tout GraphQL quand l'expiration approche.
    accessToken = await refreshInstallTokens(db, config, row);
  }
  return withSingleAuthRetry(createLinearClient({ fetchImpl, accessToken }), async () => {
    const fresh = await loadActiveInstall(db, install.id);
    const token = await refreshInstallTokens(db, config, fresh);
    return createLinearClient({ fetchImpl, accessToken: token });
  });
}

/**
 * Callback OAuth (PKCE) durci : state consommé par HASH en UN update atomique
 * (one-shot, expirable), appelant == installedBy ET owner ACTUEL de l'équipe,
 * verifier descellé, échange code→tokens via fetch injecté, SCOPES validés
 * EXACTEMENT (read + issues:create — toute surprise refusée sans stocker le
 * moindre token), organisation lue pour la corrélation webhook, tokens
 * SCELLÉS, installation activée + auditée. Aucun secret ne sort d'ici.
 */
export async function completeLinearOAuth(
  db: DB,
  config: LinearRuntimeConfig & { redirectUri: string },
  input: { userId: string; state: string; code: string },
): Promise<{ workspaceName: string }> {
  if (!config.clientId || !config.clientSecret) {
    throw new TeamStoreError('integration_not_configured');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const stateHash = await hashOauthState(input.state);
  // Consommation FENCÉE sur installedBy=userId dans le WHERE : un autre
  // utilisateur ne consomme ni n'invalide le flux de l'owner.
  const install = await takeInstallByOauthState(db, stateHash, input.userId);
  if (!install || !install.pkceVerifierEnvelope) throw new TeamStoreError('not_found');
  // …et il doit être owner ENCORE au moment du callback.
  const owner = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, install.teamId), eq(teamMember.userId, input.userId)))
    .limit(1);
  if (!owner[0] || owner[0].role !== 'owner') throw new TeamStoreError('forbidden');
  const verifier = await openIntegrationSecret(
    config.kekRing,
    { teamId: install.teamId, purpose: 'linear:pkce', recordId: `pkce:${install.teamId}` },
    install.pkceVerifierEnvelope,
  );
  const tokens = await exchangeAuthorizationCode({
    fetchImpl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    code: input.code,
    codeVerifier: verifier,
  });
  // Scopes EXACTS — un grant élargi (write/admin/…) est refusé AVANT tout
  // stockage de token.
  if (!validateGrantedScopes(tokens.scope)) {
    throw new TeamStoreError('oauth_scope_mismatch');
  }
  const client = createLinearClient({ fetchImpl, accessToken: tokens.accessToken });
  const organization = await client.organization();
  const accessEnvelope = await sealIntegrationSecret(
    config.kekRing,
    { teamId: install.teamId, purpose: 'linear:access', recordId: install.id },
    tokens.accessToken,
  );
  const refreshEnvelope = tokens.refreshToken
    ? await sealIntegrationSecret(
        config.kekRing,
        { teamId: install.teamId, purpose: 'linear:refresh', recordId: install.id },
        tokens.refreshToken,
      )
    : null;
  await activateInstall(db, install.id, {
    workspaceId: organization.id,
    workspaceName: organization.name,
    scopes: [...LINEAR_OAUTH_SCOPES],
    accessTokenEnvelope: accessEnvelope,
    refreshTokenEnvelope: refreshEnvelope,
    accessTokenExpiresAt: new Date(tokens.expiresAtMs),
  });
  return { workspaceName: organization.name };
}

/**
 * Révocation owner COMPLÈTE : tente la révocation OFFICIELLE côté Linear via
 * l'effet injecté (jamais en QA), puis efface les tokens locaux DANS TOUS LES
 * CAS. Le retour dit explicitement si la révocation distante est incertaine.
 */
export async function revokeLinearInstallFully(
  db: DB,
  config: LinearRuntimeConfig,
  userId: string,
  teamId: string,
  revokeEffect: ((accessToken: string) => Promise<boolean>) | null,
): Promise<{ revoked: true; remote: 'ok' | 'failed' | 'skipped' }> {
  const rows = await db
    .select()
    .from(teamIntegrationInstall)
    .where(
      and(eq(teamIntegrationInstall.teamId, teamId), eq(teamIntegrationInstall.provider, 'linear')),
    )
    .limit(1);
  const install = rows[0];
  let remote: 'ok' | 'failed' | 'skipped' = 'skipped';
  if (install?.accessTokenEnvelope && revokeEffect) {
    try {
      const token = await openIntegrationSecret(
        config.kekRing,
        { teamId: install.teamId, purpose: 'linear:access', recordId: install.id },
        install.accessTokenEnvelope,
      );
      remote = (await revokeEffect(token)) ? 'ok' : 'failed';
    } catch {
      remote = 'failed';
    }
  }
  // Effacement local INCONDITIONNEL (owner vérifié dans le store) + audit.
  await revokeLinearInstall(db, userId, teamId, { remote });
  return { revoked: true, remote };
}
