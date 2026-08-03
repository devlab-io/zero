/**
 * Store des intégrations d'équipe (P18 — Linear, email-first).
 *
 * Invariants :
 * - configuration (install, mappings, webhooks sortants) = OWNER-ONLY ;
 *   l'usage (préparer/créer/lier une issue) = ACL du fil partagé + installation
 *   ACTIVE de l'équipe du fil — jamais d'inférence depuis la boîte active ;
 * - les enveloppes scellées ne QUITTENT jamais ce module vers une route
 *   (vues « sanitized » : présence booléenne seule) ;
 * - un lien fil↔issue n'est persisté qu'après un issueCreate RÉUSSI ou un
 *   Accept humain explicite — jamais d'association silencieuse ;
 * - la création exige une confirmation humaine FRAÎCHE (confirm=true par
 *   requête) et une clé d'idempotence : le retry rejoue la même demande ;
 * - les webhooks entrants ne mutent que via mappings EXPLICITES, audités
 *   actorKind 'integration'/'system' avec actorUserId NULL (le schéma ne ment
 *   pas) ; jamais de création de fil/lien depuis un webhook.
 */
import {
  integrationWebhookDelivery,
  teamAuditLog,
  teamExternalLink,
  teamIntegrationInstall,
  teamIntegrationMapping,
  teamIssueCreateRequest,
  teamMember,
  teamOutboundDelivery,
  teamOutboundWebhook,
  teamThread,
  teamThreadIssueLink,
  user,
} from '../../db/schema';
import {
  ISSUE_CREATE_LEASE_MS,
  ISSUE_PREVIEW_TTL_MS,
  type ExternalLinkKind,
  type IntegrationMappingKind,
  type OutboundEventType,
  type SealedSecret,
} from './team-integrations-shared';
import {
  accessPredicate,
  appendTeamAudit,
  getTeamThread,
  requireCapability,
  TeamStoreError,
} from './team-store';
import { assertPublicHttpsUrl, type ResolveIps } from '../integrations/outbound-security';
import { LinearApiError, type LinearIssueClient } from '../integrations/linear-client';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { roleCan } from './team-roles';
import type { DB } from '../../db';

type DbOrTx = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

async function requireOwner(db: DbOrTx, teamId: string, userId: string) {
  const rows = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new TeamStoreError('not_a_member');
  if (rows[0].role !== 'owner') throw new TeamStoreError('forbidden');
}

async function requireMember(db: DbOrTx, teamId: string, userId: string) {
  const rows = await db
    .select({ role: teamMember.role })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new TeamStoreError('not_a_member');
  return rows[0];
}

// --- installation (owner-only) ----------------------------------------------

async function findInstall(db: DbOrTx, teamId: string) {
  const rows = await db
    .select()
    .from(teamIntegrationInstall)
    .where(
      and(eq(teamIntegrationInstall.teamId, teamId), eq(teamIntegrationInstall.provider, 'linear')),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Vue MEMBRE, sans aucun secret : présence booléenne des tokens seule. */
export async function getIntegrationOverview(
  db: DB,
  userId: string,
  teamId: string,
  flags: { vaultConfigured: boolean; oauthConfigured: boolean },
) {
  const membership = await requireMember(db, teamId, userId);
  const install = await findInstall(db, teamId);
  const mappings = install
    ? await db
        .select({
          id: teamIntegrationMapping.id,
          kind: teamIntegrationMapping.kind,
          retaValue: teamIntegrationMapping.retaValue,
          externalId: teamIntegrationMapping.externalId,
          externalLabel: teamIntegrationMapping.externalLabel,
        })
        .from(teamIntegrationMapping)
        .where(eq(teamIntegrationMapping.installId, install.id))
        .orderBy(asc(teamIntegrationMapping.kind), asc(teamIntegrationMapping.externalLabel))
    : [];
  return {
    isOwner: membership.role === 'owner',
    // Fail closed EXPLIQUÉ : l'owner voit ce qui manque, rien n'est bloqué
    // ailleurs dans l'app.
    vaultConfigured: flags.vaultConfigured,
    oauthConfigured: flags.oauthConfigured,
    install: install
      ? {
          id: install.id,
          status: install.status,
          workspaceId: install.workspaceId,
          workspaceName: install.workspaceName,
          scopes: install.scopes,
          hasAccessToken: !!install.accessTokenEnvelope,
          createdAt: install.createdAt,
          revokedAt: install.revokedAt,
        }
      : null,
    mappings,
  };
}

/**
 * Démarre (ou relance) l'OAuth : HASH du state + expiration + verifier SCELLÉ.
 * Relancer sur une installation ACTIVE exige une confirmation EXPLICITE
 * (reconnectConfirm) — jamais d'écrasement silencieux. Le flux est LIÉ à
 * l'owner qui le démarre (installedBy) : le callback le revérifie.
 */
export async function beginLinearInstall(
  db: DB,
  userId: string,
  teamId: string,
  input: {
    stateHash: string;
    stateExpiresAt: Date;
    pkceVerifierEnvelope: SealedSecret;
    reconnectConfirm?: boolean;
  },
) {
  await requireOwner(db, teamId, userId);
  const existing = await findInstall(db, teamId);
  const now = new Date();
  if (existing) {
    if (existing.status === 'active' && input.reconnectConfirm !== true) {
      throw new TeamStoreError('confirmation_required');
    }
    await db
      .update(teamIntegrationInstall)
      .set({
        oauthState: input.stateHash,
        stateExpiresAt: input.stateExpiresAt,
        pkceVerifierEnvelope: input.pkceVerifierEnvelope,
        installedBy: userId,
        updatedAt: now,
      })
      .where(eq(teamIntegrationInstall.id, existing.id));
    return { installId: existing.id };
  }
  const id = crypto.randomUUID();
  await db.insert(teamIntegrationInstall).values({
    id,
    teamId,
    provider: 'linear',
    status: 'pending',
    oauthState: input.stateHash,
    stateExpiresAt: input.stateExpiresAt,
    pkceVerifierEnvelope: input.pkceVerifierEnvelope,
    installedBy: userId,
  });
  return { installId: id };
}

/**
 * Consomme l'install par HASH de state — ONE-SHOT ATOMIQUE et FENCÉ SUR
 * L'OWNER : le WHERE exige state non expiré ET installedBy = userId. Un autre
 * utilisateur qui présente le state (volé/rejoué) n'obtient RIEN et surtout
 * n'invalide PAS le flux — le state reste consommable par son owner. Deux
 * callbacks concurrents du même owner : un seul obtient la ligne.
 */
export async function takeInstallByOauthState(db: DB, stateHash: string, userId: string) {
  const rows = await db
    .update(teamIntegrationInstall)
    .set({ oauthState: null, stateExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(teamIntegrationInstall.oauthState, stateHash),
        eq(teamIntegrationInstall.installedBy, userId),
        gt(teamIntegrationInstall.stateExpiresAt, new Date()),
      ),
    )
    .returning();
  const install = rows[0];
  if (!install || !install.pkceVerifierEnvelope) return null;
  return install;
}

export async function activateInstall(
  db: DB,
  installId: string,
  input: {
    workspaceId: string;
    workspaceName: string;
    scopes: string[];
    accessTokenEnvelope: SealedSecret;
    refreshTokenEnvelope: SealedSecret | null;
    accessTokenExpiresAt: Date;
  },
) {
  const rows = await db
    .select({
      teamId: teamIntegrationInstall.teamId,
      installedBy: teamIntegrationInstall.installedBy,
    })
    .from(teamIntegrationInstall)
    .where(eq(teamIntegrationInstall.id, installId))
    .limit(1);
  const install = rows[0];
  if (!install) throw new TeamStoreError('not_found');
  await db
    .update(teamIntegrationInstall)
    .set({
      status: 'active',
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
      scopes: input.scopes,
      accessTokenEnvelope: input.accessTokenEnvelope,
      refreshTokenEnvelope: input.refreshTokenEnvelope,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      pkceVerifierEnvelope: null,
      revokedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(teamIntegrationInstall.id, installId));
  await appendTeamAudit(db, {
    teamId: install.teamId,
    actorUserId: install.installedBy,
    action: 'integration.installed',
    subjectType: 'integration_install',
    subjectId: installId,
    metadata: { provider: 'linear', workspaceName: input.workspaceName },
  });
}

/** Révocation owner : tokens EFFACÉS (jamais imprimés), statut revoked. */
export async function revokeLinearInstall(
  db: DB,
  userId: string,
  teamId: string,
  metadata?: { remote?: 'ok' | 'failed' | 'skipped' },
) {
  await requireOwner(db, teamId, userId);
  const install = await findInstall(db, teamId);
  if (!install) throw new TeamStoreError('not_found');
  const now = new Date();
  await db
    .update(teamIntegrationInstall)
    .set({
      status: 'revoked',
      accessTokenEnvelope: null,
      refreshTokenEnvelope: null,
      pkceVerifierEnvelope: null,
      oauthState: null,
      stateExpiresAt: null,
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(teamIntegrationInstall.id, install.id));
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'integration.revoked',
    subjectType: 'integration_install',
    subjectId: install.id,
    // remoteRevoke explicite : 'failed' = révocation distante INCERTAINE.
    metadata: { provider: 'linear', by: 'owner', remoteRevoke: metadata?.remote ?? 'skipped' },
  });
  return { revoked: true };
}

/**
 * Webhook `OAuthApp revoked` : désactive l'installation du workspace et efface
 * les tokens scellés — audit SYSTÈME (actorUserId NULL), aucun secret loggé.
 */
export async function handleOAuthAppRevoked(db: DB, workspaceId: string) {
  const rows = await db
    .select({ id: teamIntegrationInstall.id, teamId: teamIntegrationInstall.teamId })
    .from(teamIntegrationInstall)
    .where(
      and(
        eq(teamIntegrationInstall.provider, 'linear'),
        eq(teamIntegrationInstall.workspaceId, workspaceId),
        eq(teamIntegrationInstall.status, 'active'),
      ),
    );
  const now = new Date();
  for (const install of rows) {
    await db
      .update(teamIntegrationInstall)
      .set({
        status: 'revoked',
        accessTokenEnvelope: null,
        refreshTokenEnvelope: null,
        pkceVerifierEnvelope: null,
        oauthState: null,
        stateExpiresAt: null,
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(teamIntegrationInstall.id, install.id));
    await appendTeamAudit(db, {
      teamId: install.teamId,
      actorUserId: null,
      actorKind: 'system',
      action: 'integration.revoked',
      subjectType: 'integration_install',
      subjectId: install.id,
      metadata: { provider: 'linear', by: 'oauth_app_revoked' },
    });
  }
  return { revoked: rows.length };
}

// --- mappings (owner-only, EXPLICITES) ---------------------------------------

export async function setMapping(
  db: DB,
  userId: string,
  teamId: string,
  input: {
    kind: IntegrationMappingKind;
    retaValue: string;
    /** '' = suppression du slot. */
    externalId: string;
    externalLabel?: string;
  },
) {
  await requireOwner(db, teamId, userId);
  const install = await findInstall(db, teamId);
  if (!install) throw new TeamStoreError('integration_not_installed');
  if (input.externalId === '') {
    await db
      .delete(teamIntegrationMapping)
      .where(
        and(
          eq(teamIntegrationMapping.installId, install.id),
          eq(teamIntegrationMapping.kind, input.kind),
          eq(teamIntegrationMapping.retaValue, input.retaValue),
        ),
      );
  } else {
    if (input.kind === 'assignee') {
      // Un mapping neuf ne cible qu'un membre qui peut réellement travailler
      // un fil. La suppression d'un mapping stale reste toujours possible.
      const mapped = await requireMember(db, teamId, input.retaValue);
      if (!roleCan(mapped.role, 'thread.write')) throw new TeamStoreError('mapping_missing');
    }
    if (input.kind === 'status' && input.retaValue !== 'open' && input.retaValue !== 'closed') {
      throw new TeamStoreError('mapping_missing');
    }
    await db
      .insert(teamIntegrationMapping)
      .values({
        id: crypto.randomUUID(),
        installId: install.id,
        kind: input.kind,
        retaValue: input.retaValue,
        externalId: input.externalId,
        externalLabel: input.externalLabel ?? '',
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [
          teamIntegrationMapping.installId,
          teamIntegrationMapping.kind,
          teamIntegrationMapping.retaValue,
        ],
        set: {
          externalId: input.externalId,
          externalLabel: input.externalLabel ?? '',
          updatedAt: new Date(),
        },
      });
  }
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'integration.mapping_set',
    subjectType: 'integration_mapping',
    subjectId: `${input.kind}:${input.retaValue}`,
    metadata: { kind: input.kind, retaValue: input.retaValue, externalId: input.externalId },
  });
  return { ok: true };
}

async function loadMappings(db: DbOrTx, installId: string) {
  return await db
    .select({
      kind: teamIntegrationMapping.kind,
      retaValue: teamIntegrationMapping.retaValue,
      externalId: teamIntegrationMapping.externalId,
      externalLabel: teamIntegrationMapping.externalLabel,
    })
    .from(teamIntegrationMapping)
    .where(eq(teamIntegrationMapping.installId, installId));
}

// --- liens fil ↔ issue / liens externes --------------------------------------

/** Vue intégration d'un fil — ACL du fil relue à CHAQUE appel. */
export async function listThreadIntegration(db: DB, userId: string, teamThreadId: string) {
  const thread = await getTeamThread(db, userId, teamThreadId);
  const install = await findInstall(db, thread.teamId);
  const links = await db
    .select({
      id: teamThreadIssueLink.id,
      issueId: teamThreadIssueLink.issueId,
      issueIdentifier: teamThreadIssueLink.issueIdentifier,
      issueUrl: teamThreadIssueLink.issueUrl,
      createdAt: teamThreadIssueLink.createdAt,
    })
    .from(teamThreadIssueLink)
    .where(
      and(
        eq(teamThreadIssueLink.teamThreadId, teamThreadId),
        isNull(teamThreadIssueLink.unlinkedAt),
      ),
    )
    .orderBy(desc(teamThreadIssueLink.createdAt));
  const externalLinks = await db
    .select({
      id: teamExternalLink.id,
      kind: teamExternalLink.kind,
      label: teamExternalLink.label,
      url: teamExternalLink.url,
      createdBy: teamExternalLink.createdBy,
      createdAt: teamExternalLink.createdAt,
    })
    .from(teamExternalLink)
    .where(and(eq(teamExternalLink.teamThreadId, teamThreadId), isNull(teamExternalLink.removedAt)))
    .orderBy(desc(teamExternalLink.createdAt));
  const mappings = install && install.status === 'active' ? await loadMappings(db, install.id) : [];
  return {
    installStatus: install?.status ?? null,
    /** Sujet CAPTURÉ au partage — jamais lu depuis la boîte du membre. */
    subject: thread.subject,
    issueLinks: links,
    externalLinks,
    allowedTeams: mappings
      .filter((m) => m.kind === 'team')
      .map((m) => ({ id: m.externalId, label: m.externalLabel })),
    statusMappings: mappings
      .filter((m) => m.kind === 'status')
      .map((m) => ({ retaStatus: m.retaValue, externalId: m.externalId, label: m.externalLabel })),
    assigneeMappings: mappings
      .filter((m) => m.kind === 'assignee')
      .map((m) => ({ userId: m.retaValue, externalId: m.externalId, label: m.externalLabel })),
  };
}

export async function addExternalLink(
  db: DB,
  userId: string,
  teamThreadId: string,
  input: { kind: ExternalLinkKind; label: string; url: string },
) {
  const thread = await getTeamThread(db, userId, teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new TeamStoreError('invalid_url');
  }
  if (parsed.protocol !== 'https:') throw new TeamStoreError('invalid_url');
  const id = crypto.randomUUID();
  await db.insert(teamExternalLink).values({
    id,
    teamThreadId,
    kind: input.kind,
    label: input.label.slice(0, 200),
    url: input.url,
    createdBy: userId,
  });
  await appendTeamAudit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'integration.external_link_added',
    subjectType: 'external_link',
    subjectId: id,
    metadata: { teamThreadId, kind: input.kind },
  });
  return { id };
}

export async function removeExternalLink(db: DB, userId: string, linkId: string) {
  const rows = await db
    .select({
      id: teamExternalLink.id,
      teamThreadId: teamExternalLink.teamThreadId,
      createdBy: teamExternalLink.createdBy,
      removedAt: teamExternalLink.removedAt,
    })
    .from(teamExternalLink)
    .where(eq(teamExternalLink.id, linkId))
    .limit(1);
  const link = rows[0];
  if (!link || link.removedAt) throw new TeamStoreError('not_found');
  const thread = await getTeamThread(db, userId, link.teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  if (link.createdBy !== userId) {
    // Sinon : owner de l'équipe uniquement.
    await requireOwner(db, thread.teamId, userId);
  }
  await db
    .update(teamExternalLink)
    .set({ removedAt: new Date(), removedBy: userId })
    .where(eq(teamExternalLink.id, linkId));
  await appendTeamAudit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'integration.external_link_removed',
    subjectType: 'external_link',
    subjectId: linkId,
    metadata: { teamThreadId: link.teamThreadId },
  });
  return { ok: true };
}

export async function unlinkIssue(db: DB, userId: string, linkId: string) {
  const rows = await db
    .select({
      id: teamThreadIssueLink.id,
      teamThreadId: teamThreadIssueLink.teamThreadId,
      issueIdentifier: teamThreadIssueLink.issueIdentifier,
      unlinkedAt: teamThreadIssueLink.unlinkedAt,
    })
    .from(teamThreadIssueLink)
    .where(eq(teamThreadIssueLink.id, linkId))
    .limit(1);
  const link = rows[0];
  if (!link || link.unlinkedAt) throw new TeamStoreError('not_found');
  const thread = await getTeamThread(db, userId, link.teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  await db
    .update(teamThreadIssueLink)
    .set({ unlinkedAt: new Date(), unlinkedBy: userId })
    .where(eq(teamThreadIssueLink.id, linkId));
  await appendTeamAudit(db, {
    teamId: thread.teamId,
    actorUserId: userId,
    action: 'integration.issue_unlinked',
    subjectType: 'issue_link',
    subjectId: linkId,
    metadata: { teamThreadId: link.teamThreadId, issueIdentifier: link.issueIdentifier },
  });
  return { ok: true };
}

// --- création d'issue (preview → confirmation → idempotence) -----------------

type ActiveInstall = NonNullable<Awaited<ReturnType<typeof findInstall>>>;

async function requireActiveInstallForThread(db: DbOrTx, teamId: string): Promise<ActiveInstall> {
  const install = await findInstall(db, teamId);
  if (!install) throw new TeamStoreError('integration_not_installed');
  if (install.status === 'revoked') throw new TeamStoreError('integration_revoked');
  if (install.status !== 'active') throw new TeamStoreError('integration_not_installed');
  return install;
}

export type LinearClientForInstall = (install: {
  id: string;
  teamId: string;
}) => Promise<LinearIssueClient>;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

function validateMappings(
  mappings: Awaited<ReturnType<typeof loadMappings>>,
  target: { linearTeamId: string; stateId: string | null; assigneeExternalId: string | null },
) {
  if (!mappings.some((m) => m.kind === 'team' && m.externalId === target.linearTeamId)) {
    throw new TeamStoreError('mapping_missing');
  }
  if (
    target.stateId &&
    !mappings.some((m) => m.kind === 'status' && m.externalId === target.stateId)
  ) {
    throw new TeamStoreError('mapping_missing');
  }
  if (
    target.assigneeExternalId &&
    !mappings.some((m) => m.kind === 'assignee' && m.externalId === target.assigneeExternalId)
  ) {
    throw new TeamStoreError('mapping_missing');
  }
}

async function requireAssignableMember(
  db: DbOrTx,
  teamId: string,
  memberUserId: string,
  teamThreadId: string,
) {
  const member = await requireMember(db, teamId, memberUserId);
  if (!roleCan(member.role, 'thread.write')) throw new TeamStoreError('mapping_missing');
  const accessible = await db
    .select({ id: teamThread.id })
    .from(teamThread)
    .where(and(eq(teamThread.id, teamThreadId), accessPredicate(memberUserId)))
    .limit(1);
  if (!accessible[0]) throw new TeamStoreError('mapping_missing');
  return member;
}

/** Bail 'pending' expiré → needs_reconciliation (CAS) — JAMAIS de rejeu aveugle. */
async function reconcileStalePending(db: DbOrTx, requestId: string) {
  await db
    .update(teamIssueCreateRequest)
    .set({ status: 'needs_reconciliation', resolvedAt: new Date() })
    .where(
      and(
        eq(teamIssueCreateRequest.id, requestId),
        eq(teamIssueCreateRequest.status, 'pending'),
        lt(teamIssueCreateRequest.leaseExpiresAt, new Date()),
      ),
    );
}

/**
 * APERÇU SERVEUR persisté (hardening-10) : le titre est dérivé serveur (sujet
 * capturé au partage, override borné), le backlink Reta est construit SERVEUR
 * depuis l'origine publique — le client ne peut ni le retirer ni le forger —
 * et la description canonique = note bornée + backlink. Digest + expiration
 * posés en base : la confirmation ne référencera QUE previewId + clé + digest,
 * jamais un contenu arbitraire.
 */
export async function previewIssue(
  db: DB,
  userId: string,
  input: {
    teamThreadId: string;
    clientRequestKey: string;
    linearTeamId: string;
    stateId?: string | null;
    assigneeUserId?: string | null;
    title?: string | null;
    note?: string | null;
  },
  config: { appOrigin: string },
) {
  const thread = await getTeamThread(db, userId, input.teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  const install = await requireActiveInstallForThread(db, thread.teamId);
  const mappings = await loadMappings(db, install.id);
  let assigneeExternalId: string | null = null;
  if (input.assigneeUserId) {
    const mapping = mappings.find(
      (m) => m.kind === 'assignee' && m.retaValue === input.assigneeUserId,
    );
    if (!mapping) throw new TeamStoreError('mapping_missing');
    await requireAssignableMember(db, thread.teamId, input.assigneeUserId, input.teamThreadId);
    assigneeExternalId = mapping.externalId;
  }
  validateMappings(mappings, {
    linearTeamId: input.linearTeamId,
    stateId: input.stateId ?? null,
    assigneeExternalId,
  });

  // Canonique SERVEUR — aucune donnée mailbox hors ACL : sujet capturé au
  // partage, note utilisateur bornée, backlink construit ici.
  const title = ((input.title ?? '').trim() || thread.subject.trim() || 'Email thread').slice(
    0,
    500,
  );
  const note = (input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000);
  const backlinkUrl = `${config.appOrigin.replace(/\/$/, '')}/team?team=${encodeURIComponent(
    thread.teamId,
  )}&thread=${encodeURIComponent(input.teamThreadId)}`;
  const description = (note ? `> ${note}\n\n` : '') + `[Reta thread](${backlinkUrl})`;
  const digest = await sha256Hex(
    JSON.stringify([
      install.id,
      input.teamThreadId,
      input.linearTeamId,
      input.stateId ?? '',
      assigneeExternalId ?? '',
      title,
      description,
    ]),
  );
  const expiresAt = new Date(Date.now() + ISSUE_PREVIEW_TTL_MS);

  const values = {
    installId: install.id,
    teamThreadId: input.teamThreadId,
    requestedBy: userId,
    clientRequestKey: input.clientRequestKey,
    title,
    description,
    linearTeamId: input.linearTeamId,
    stateId: input.stateId ?? null,
    assigneeExternalId,
    status: 'previewed' as const,
    previewDigest: digest,
    previewExpiresAt: expiresAt,
  };
  const previewResult = {
    title,
    description,
    backlinkUrl,
    digest,
    expiresAt: expiresAt.toISOString(),
    status: 'previewed' as const,
  };

  const inserted = await db
    .insert(teamIssueCreateRequest)
    .values({ id: crypto.randomUUID(), ...values })
    .onConflictDoNothing()
    .returning({ id: teamIssueCreateRequest.id });
  if (inserted[0]) return { previewId: inserted[0].id, ...previewResult };

  const existingRows = await db
    .select()
    .from(teamIssueCreateRequest)
    .where(
      and(
        eq(teamIssueCreateRequest.installId, install.id),
        eq(teamIssueCreateRequest.clientRequestKey, input.clientRequestKey),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw new TeamStoreError('issue_create_failed');
  // Idempotence STRICTE : la même clé pour un autre fil ou un autre acteur
  // est un conflit — refus SANS fuite du contenu de l'autre demande.
  if (existing.teamThreadId !== input.teamThreadId || existing.requestedBy !== userId) {
    throw new TeamStoreError('idempotency_conflict');
  }
  if (existing.status === 'created') {
    return {
      previewId: existing.id,
      status: 'created' as const,
      issueId: existing.issueId!,
      issueIdentifier: existing.issueIdentifier ?? '',
      issueUrl: existing.issueUrl ?? '',
    };
  }
  if (existing.status === 'needs_reconciliation') throw new TeamStoreError('needs_reconciliation');
  if (existing.status === 'pending') {
    await reconcileStalePending(db, existing.id);
    const still = await db
      .select({ status: teamIssueCreateRequest.status })
      .from(teamIssueCreateRequest)
      .where(eq(teamIssueCreateRequest.id, existing.id))
      .limit(1);
    if (still[0]?.status === 'pending') throw new TeamStoreError('issue_create_in_flight');
    throw new TeamStoreError('needs_reconciliation');
  }
  // previewed | failed → l'aperçu frais SUPERSÈDE (CAS sur ces états seuls).
  const updated = await db
    .update(teamIssueCreateRequest)
    .set({ ...values, error: null, resolvedAt: null })
    .where(
      and(
        eq(teamIssueCreateRequest.id, existing.id),
        inArray(teamIssueCreateRequest.status, ['previewed', 'failed']),
      ),
    )
    .returning({ id: teamIssueCreateRequest.id });
  if (!updated[0]) throw new TeamStoreError('issue_create_in_flight');
  return { previewId: existing.id, ...previewResult };
}

/**
 * CONFIRMATION par RÉFÉRENCE seule (previewId + clé + digest) — jamais de
 * titre/description arbitraires, jamais un booléen nu. ACL et mappings
 * REVALIDÉS ; aperçu expiré/altéré refusé ; claim CAS avec bail ; issue
 * réseau inconnue ⇒ needs_reconciliation (aucune seconde issue, aucune fausse
 * garantie) ; lien + audit dans UNE transaction après le succès.
 */
export async function confirmIssue(
  db: DB,
  getClient: LinearClientForInstall,
  userId: string,
  input: { previewId: string; clientRequestKey: string; digest: string },
) {
  const rows = await db
    .select()
    .from(teamIssueCreateRequest)
    .where(eq(teamIssueCreateRequest.id, input.previewId))
    .limit(1);
  const request = rows[0];
  if (!request || request.clientRequestKey !== input.clientRequestKey) {
    throw new TeamStoreError('preview_invalid');
  }
  if (request.requestedBy !== userId) throw new TeamStoreError('forbidden');
  // ACL RELUE + fil exact + install active de l'équipe DU FIL.
  const thread = await getTeamThread(db, userId, request.teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  const install = await requireActiveInstallForThread(db, thread.teamId);
  if (install.id !== request.installId) throw new TeamStoreError('preview_invalid');

  if (request.status === 'created') {
    return {
      issueId: request.issueId!,
      issueIdentifier: request.issueIdentifier ?? '',
      issueUrl: request.issueUrl ?? '',
      duplicate: true as const,
    };
  }
  if (request.status === 'needs_reconciliation') throw new TeamStoreError('needs_reconciliation');
  if (request.status === 'pending') {
    await reconcileStalePending(db, request.id);
    const still = await db
      .select({ status: teamIssueCreateRequest.status })
      .from(teamIssueCreateRequest)
      .where(eq(teamIssueCreateRequest.id, request.id))
      .limit(1);
    if (still[0]?.status === 'pending') throw new TeamStoreError('issue_create_in_flight');
    throw new TeamStoreError('needs_reconciliation');
  }
  if (!request.previewDigest || request.previewDigest !== input.digest) {
    throw new TeamStoreError('preview_invalid');
  }
  if (!request.previewExpiresAt || request.previewExpiresAt.getTime() <= Date.now()) {
    throw new TeamStoreError('preview_expired');
  }
  // Mappings REVALIDÉS à la confirmation : un owner a pu les changer.
  const currentMappings = await loadMappings(db, install.id);
  validateMappings(currentMappings, {
    linearTeamId: request.linearTeamId,
    stateId: request.stateId,
    assigneeExternalId: request.assigneeExternalId,
  });
  if (request.assigneeExternalId) {
    const mapping = currentMappings.find(
      (row) => row.kind === 'assignee' && row.externalId === request.assigneeExternalId,
    );
    if (!mapping) throw new TeamStoreError('mapping_missing');
    await requireAssignableMember(db, thread.teamId, mapping.retaValue, request.teamThreadId);
  }

  // Claim CAS : previewed|failed → pending avec bail.
  const claimed = await db
    .update(teamIssueCreateRequest)
    .set({
      status: 'pending',
      leaseExpiresAt: new Date(Date.now() + ISSUE_CREATE_LEASE_MS),
      error: null,
    })
    .where(
      and(
        eq(teamIssueCreateRequest.id, request.id),
        inArray(teamIssueCreateRequest.status, ['previewed', 'failed']),
        eq(teamIssueCreateRequest.previewDigest, input.digest),
      ),
    )
    .returning({ id: teamIssueCreateRequest.id });
  if (!claimed[0]) throw new TeamStoreError('issue_create_in_flight');

  let client: LinearIssueClient;
  try {
    client = await getClient({ id: install.id, teamId: install.teamId });
  } catch (error) {
    // Échec PROUVÉ avant tout appel réseau (vault/config) : rejouable.
    await db
      .update(teamIssueCreateRequest)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 500) : 'client_unavailable',
        resolvedAt: new Date(),
      })
      .where(eq(teamIssueCreateRequest.id, request.id));
    throw error instanceof TeamStoreError ? error : new TeamStoreError('issue_create_failed');
  }

  let issue: { id: string; identifier: string; url: string };
  try {
    issue = await client.issueCreate({
      teamId: request.linearTeamId,
      title: request.title,
      description: request.description,
      ...(request.stateId ? { stateId: request.stateId } : {}),
      ...(request.assigneeExternalId ? { assigneeId: request.assigneeExternalId } : {}),
    });
  } catch (error) {
    const proven =
      error instanceof LinearApiError &&
      (error.kind === 'proven_failed' || error.kind === 'unauthorized');
    if (proven) {
      // Linear a RÉPONDU sans créer : rejouable.
      await db
        .update(teamIssueCreateRequest)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 500) : 'failed',
          resolvedAt: new Date(),
        })
        .where(eq(teamIssueCreateRequest.id, request.id));
      throw new TeamStoreError('issue_create_failed');
    }
    // Issue INCONNUE (réseau/5xx/crash) : l'issue a PU être créée — Linear
    // n'offre pas d'idempotence documentée, donc JAMAIS de rejeu : l'owner
    // réconcilie manuellement (recherche exacte puis Accept).
    await db
      .update(teamIssueCreateRequest)
      .set({
        status: 'needs_reconciliation',
        error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
        resolvedAt: new Date(),
      })
      .where(eq(teamIssueCreateRequest.id, request.id));
    throw new TeamStoreError('needs_reconciliation');
  }

  // Succès : marquage + lien + audit dans UNE transaction.
  await db.transaction(async (tx) => {
    await tx
      .update(teamIssueCreateRequest)
      .set({
        status: 'created',
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueUrl: issue.url,
        resolvedAt: new Date(),
      })
      .where(eq(teamIssueCreateRequest.id, request.id));
    await tx
      .insert(teamThreadIssueLink)
      .values({
        id: crypto.randomUUID(),
        teamThreadId: request.teamThreadId,
        installId: install.id,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueUrl: issue.url,
        createdBy: userId,
      })
      .onConflictDoNothing();
    await appendTeamAudit(tx, {
      teamId: thread.teamId,
      actorUserId: userId,
      action: 'integration.issue_created',
      subjectType: 'issue_link',
      subjectId: issue.id,
      metadata: { teamThreadId: request.teamThreadId, issueIdentifier: issue.identifier },
    });
  });
  return {
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    issueUrl: issue.url,
    duplicate: false as const,
  };
}

/**
 * Accept d'une SUGGESTION de lien (l'aperçu n'est jamais persisté) : résout
 * l'identifiant côté Linear puis crée le lien — geste humain explicite.
 */
export async function acceptIssueLink(
  db: DB,
  getClient: LinearClientForInstall,
  userId: string,
  input: { teamThreadId: string; identifier: string },
) {
  const thread = await getTeamThread(db, userId, input.teamThreadId);
  await requireCapability(db, thread.teamId, userId, 'thread.write');
  const install = await requireActiveInstallForThread(db, thread.teamId);
  const client = await getClient({ id: install.id, teamId: install.teamId });
  const issue = await client.findIssueByIdentifier(input.identifier);
  if (!issue) throw new TeamStoreError('not_found');
  await db.transaction(async (tx) => {
    await tx
      .insert(teamThreadIssueLink)
      .values({
        id: crypto.randomUUID(),
        teamThreadId: input.teamThreadId,
        installId: install.id,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueUrl: issue.url,
        createdBy: userId,
      })
      .onConflictDoNothing();
    await appendTeamAudit(tx, {
      teamId: thread.teamId,
      actorUserId: userId,
      action: 'integration.issue_linked',
      subjectType: 'issue_link',
      subjectId: issue.id,
      metadata: { teamThreadId: input.teamThreadId, issueIdentifier: issue.identifier },
    });
  });
  return { issueId: issue.id, issueIdentifier: issue.identifier, issueUrl: issue.url };
}

// --- webhook Linear ENTRANT --------------------------------------------------

/** Une livraison déjà TRAITÉE (processed_at posé) — le seul cas replay=200. */
export async function isWebhookDeliveryProcessed(db: DB, deliveryId: string) {
  const rows = await db
    .select({ processedAt: integrationWebhookDelivery.processedAt })
    .from(integrationWebhookDelivery)
    .where(
      and(
        eq(integrationWebhookDelivery.provider, 'linear'),
        eq(integrationWebhookDelivery.deliveryId, deliveryId),
      ),
    )
    .limit(1);
  return !!rows[0]?.processedAt;
}

/** Claim atomique anti-replay : false = déjà vue (répondre 200 idempotent). */
export async function claimWebhookDelivery(db: DB, deliveryId: string, eventType: string) {
  const inserted = await db
    .insert(integrationWebhookDelivery)
    .values({ id: crypto.randomUUID(), provider: 'linear', deliveryId, eventType })
    .onConflictDoNothing()
    .returning({ id: integrationWebhookDelivery.id });
  return inserted.length > 0;
}

export async function markWebhookDeliveryProcessed(db: DB, deliveryId: string, outcome: string) {
  await db
    .update(integrationWebhookDelivery)
    .set({ processedAt: new Date(), outcome })
    .where(
      and(
        eq(integrationWebhookDelivery.provider, 'linear'),
        eq(integrationWebhookDelivery.deliveryId, deliveryId),
      ),
    );
}

/**
 * Traite un événement Linear AUTHENTIFIÉ (signature déjà vérifiée sur octets
 * bruts). Corrélation EXACTE workspace→install + issue→lien actif ; les
 * changements status/assignee ne sont reflétés que via mappings EXPLICITES,
 * audités actorKind 'integration' (actorUserId NULL). AUCUNE création de
 * fil ou de lien depuis un webhook.
 */
export async function processLinearEvent(
  db: DB,
  payload: Record<string, unknown>,
): Promise<string> {
  const type = String(payload['type'] ?? '');
  const action = String(payload['action'] ?? '');
  const organizationId = String(payload['organizationId'] ?? '');

  if (type === 'OAuthApp' && action === 'revoked') {
    const { revoked } = await handleOAuthAppRevoked(db, organizationId);
    return revoked > 0 ? 'oauth_revoked' : 'ignored';
  }
  if (type !== 'Issue' || !organizationId) return 'ignored';

  const data = (payload['data'] ?? {}) as Record<string, unknown>;
  const issueId = String(data['id'] ?? '');
  if (!issueId) return 'ignored';
  // `data.updatedAt` décrit la version de l'issue elle-même. Contrairement au
  // timestamp d'envoi du webhook, il reste stable lors d'un retry tardif et
  // permet donc de rejeter un état plus ancien arrivé après un état récent.
  const issueUpdatedAt = new Date(String(data['updatedAt'] ?? ''));
  if (!Number.isFinite(issueUpdatedAt.getTime())) return 'ignored';

  const installs = await db
    .select({ id: teamIntegrationInstall.id, teamId: teamIntegrationInstall.teamId })
    .from(teamIntegrationInstall)
    .where(
      and(
        eq(teamIntegrationInstall.provider, 'linear'),
        eq(teamIntegrationInstall.workspaceId, organizationId),
        eq(teamIntegrationInstall.status, 'active'),
      ),
    );
  if (installs.length === 0) return 'ignored';

  let touched = 0;
  for (const install of installs) {
    const links = await db
      .select({ id: teamThreadIssueLink.id, teamThreadId: teamThreadIssueLink.teamThreadId })
      .from(teamThreadIssueLink)
      .where(
        and(
          eq(teamThreadIssueLink.installId, install.id),
          eq(teamThreadIssueLink.issueId, issueId),
          isNull(teamThreadIssueLink.unlinkedAt),
        ),
      );
    if (links.length === 0) continue;
    const mappings = await loadMappings(db, install.id);
    const stateId = String((data['state'] as Record<string, unknown> | undefined)?.['id'] ?? '');
    const assigneeId = String(
      (data['assignee'] as Record<string, unknown> | undefined)?.['id'] ?? '',
    );
    const statusMapping = stateId
      ? mappings.find((m) => m.kind === 'status' && m.externalId === stateId)
      : undefined;
    const assigneeMapping = assigneeId
      ? mappings.find((m) => m.kind === 'assignee' && m.externalId === assigneeId)
      : undefined;
    const retaStatus =
      statusMapping?.retaValue === 'open' || statusMapping?.retaValue === 'closed'
        ? statusMapping.retaValue
        : null;
    let mappedAssigneeIsWriter = false;
    if (assigneeMapping) {
      const mappedRows = await db
        .select({ role: teamMember.role })
        .from(teamMember)
        .where(
          and(
            eq(teamMember.teamId, install.teamId),
            eq(teamMember.userId, assigneeMapping.retaValue),
          ),
        )
        .limit(1);
      mappedAssigneeIsWriter = !!mappedRows[0] && roleCan(mappedRows[0].role, 'thread.write');
    }
    if (!retaStatus && !mappedAssigneeIsWriter) continue;
    for (const link of links) {
      const set: Record<string, unknown> = { lastActivityAt: new Date(), updatedAt: new Date() };
      if (retaStatus) {
        set['status'] = retaStatus;
      }
      let assigneeUserId: string | null = null;
      if (assigneeMapping && mappedAssigneeIsWriter) {
        const accessible = await db
          .select({ id: teamThread.id })
          .from(teamThread)
          .where(
            and(eq(teamThread.id, link.teamThreadId), accessPredicate(assigneeMapping.retaValue)),
          )
          .limit(1);
        if (accessible[0]) assigneeUserId = assigneeMapping.retaValue;
      }
      if (assigneeUserId) set['assigneeUserId'] = assigneeUserId;
      if (!retaStatus && !assigneeUserId) continue;
      const claimedFreshness = await db
        .update(teamThreadIssueLink)
        .set({ lastLinearUpdatedAt: issueUpdatedAt })
        .where(
          and(
            eq(teamThreadIssueLink.id, link.id),
            or(
              isNull(teamThreadIssueLink.lastLinearUpdatedAt),
              lt(teamThreadIssueLink.lastLinearUpdatedAt, issueUpdatedAt),
            ),
          ),
        )
        .returning({ id: teamThreadIssueLink.id });
      if (!claimedFreshness[0]) continue;
      await db.update(teamThread).set(set).where(eq(teamThread.id, link.teamThreadId));
      await appendTeamAudit(db, {
        teamId: install.teamId,
        actorUserId: null,
        actorKind: 'integration',
        action: 'integration.issue_synced',
        subjectType: 'team_thread',
        subjectId: link.teamThreadId,
        metadata: {
          provider: 'linear',
          issueId,
          linearUpdatedAt: issueUpdatedAt.toISOString(),
          ...(retaStatus ? { status: retaStatus } : {}),
          ...(assigneeUserId ? { assigneeUserId } : {}),
        },
      });
      touched += 1;
    }
  }
  return touched > 0 ? 'synced' : 'ignored';
}

// --- webhooks SORTANTS (owner-only) ------------------------------------------

export async function listOutboundWebhooks(db: DB, userId: string, teamId: string) {
  await requireOwner(db, teamId, userId);
  const rows = await db
    .select({
      id: teamOutboundWebhook.id,
      url: teamOutboundWebhook.url,
      events: teamOutboundWebhook.events,
      active: teamOutboundWebhook.active,
      hasSecret: teamOutboundWebhook.secretEnvelope,
      consecutiveFailures: teamOutboundWebhook.consecutiveFailures,
      createdAt: teamOutboundWebhook.createdAt,
    })
    .from(teamOutboundWebhook)
    .where(eq(teamOutboundWebhook.teamId, teamId))
    .orderBy(asc(teamOutboundWebhook.createdAt));
  // Le secret ne sort JAMAIS — présence booléenne seule.
  return rows.map((row) => ({ ...row, hasSecret: !!row.hasSecret }));
}

export async function createOutboundWebhook(
  db: DB,
  userId: string,
  teamId: string,
  input: {
    /** Fourni par l'appelant : le secret est scellé sur CET id (AAD). */
    id: string;
    url: string;
    events: OutboundEventType[];
    secretEnvelope: SealedSecret;
  },
  /** Résolveur DNS INJECTÉ — garde SSRF COMPLÈTE dès l'enregistrement. */
  resolveIps: ResolveIps,
) {
  await requireOwner(db, teamId, userId);
  try {
    await assertPublicHttpsUrl(input.url, resolveIps);
  } catch {
    // Même garde qu'à la livraison (schéma/hôte/IP/DNS) — code uniforme.
    throw new TeamStoreError('invalid_url');
  }
  const id = input.id;
  await db.insert(teamOutboundWebhook).values({
    id,
    teamId,
    url: input.url,
    events: input.events,
    secretEnvelope: input.secretEnvelope,
    createdBy: userId,
  });
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'integration.outbound_webhook_created',
    subjectType: 'outbound_webhook',
    subjectId: id,
    metadata: { events: input.events },
  });
  return { id };
}

/** Livraisons d'un webhook (owner) — pour l'UI dead/retry ; payload = métadonnées. */
export async function listOutboundDeliveries(
  db: DB,
  userId: string,
  teamId: string,
  webhookId: string,
  options?: { status?: 'pending' | 'sending' | 'delivered' | 'dead' },
) {
  await requireOwner(db, teamId, userId);
  const owned = await db
    .select({ id: teamOutboundWebhook.id })
    .from(teamOutboundWebhook)
    .where(and(eq(teamOutboundWebhook.id, webhookId), eq(teamOutboundWebhook.teamId, teamId)))
    .limit(1);
  if (!owned[0]) throw new TeamStoreError('not_found');
  return await db
    .select({
      id: teamOutboundDelivery.id,
      eventType: teamOutboundDelivery.eventType,
      status: teamOutboundDelivery.status,
      attempts: teamOutboundDelivery.attempts,
      lastError: teamOutboundDelivery.lastError,
      createdAt: teamOutboundDelivery.createdAt,
      deliveredAt: teamOutboundDelivery.deliveredAt,
    })
    .from(teamOutboundDelivery)
    .where(
      options?.status
        ? and(
            eq(teamOutboundDelivery.webhookId, webhookId),
            eq(teamOutboundDelivery.status, options.status),
          )
        : eq(teamOutboundDelivery.webhookId, webhookId),
    )
    .orderBy(desc(teamOutboundDelivery.createdAt))
    .limit(100);
}

/** Rejeu MANUEL owner des livraisons 'dead' d'un webhook : dead → pending. */
export async function retryDeadOutbound(db: DB, userId: string, teamId: string, webhookId: string) {
  await requireOwner(db, teamId, userId);
  const owned = await db
    .select({ id: teamOutboundWebhook.id })
    .from(teamOutboundWebhook)
    .where(and(eq(teamOutboundWebhook.id, webhookId), eq(teamOutboundWebhook.teamId, teamId)))
    .limit(1);
  if (!owned[0]) throw new TeamStoreError('not_found');
  const revived = await db
    .update(teamOutboundDelivery)
    .set({
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      claimedAt: null,
      lastError: null,
    })
    .where(
      and(eq(teamOutboundDelivery.webhookId, webhookId), eq(teamOutboundDelivery.status, 'dead')),
    )
    .returning({ id: teamOutboundDelivery.id });
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: 'integration.outbound_retry',
    subjectType: 'outbound_webhook',
    subjectId: webhookId,
    metadata: { revived: revived.length },
  });
  return { revived: revived.length };
}

export async function setOutboundWebhookActive(
  db: DB,
  userId: string,
  teamId: string,
  webhookId: string,
  active: boolean,
) {
  await requireOwner(db, teamId, userId);
  const updated = await db
    .update(teamOutboundWebhook)
    .set({
      active,
      disabledAt: active ? null : new Date(),
      // Réactiver remet le compteur d'échecs consécutifs à zéro.
      ...(active ? { consecutiveFailures: 0 } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teamOutboundWebhook.id, webhookId), eq(teamOutboundWebhook.teamId, teamId)))
    .returning({ id: teamOutboundWebhook.id });
  if (!updated[0]) throw new TeamStoreError('not_found');
  await appendTeamAudit(db, {
    teamId,
    actorUserId: userId,
    action: active
      ? 'integration.outbound_webhook_enabled'
      : 'integration.outbound_webhook_disabled',
    subjectType: 'outbound_webhook',
    subjectId: webhookId,
  });
  return { ok: true };
}

// --- export d'activité (owner, paginé, schéma stable) ------------------------

const EXPORT_MAX_LIMIT = 200;

/**
 * Export de l'activité d'équipe (journal d'audit) — OWNER-ONLY, curseur
 * (createdAt, id) stable, schéma de sortie FIGÉ. Aucune donnée mailbox
 * implicite : uniquement le journal collaboratif déjà borné.
 */
export async function exportTeamActivity(
  db: DB,
  userId: string,
  teamId: string,
  input: { cursor?: string | null; limit?: number },
) {
  await requireOwner(db, teamId, userId);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), EXPORT_MAX_LIMIT);
  let cursorCondition = undefined;
  if (input.cursor) {
    const [rawTs, rawId] = input.cursor.split('|');
    const ts = Number(rawTs);
    if (!Number.isFinite(ts) || !rawId) throw new TeamStoreError('not_found');
    const cursorDate = new Date(ts);
    cursorCondition = or(
      lt(teamAuditLog.createdAt, cursorDate),
      and(eq(teamAuditLog.createdAt, cursorDate), lt(teamAuditLog.id, rawId)),
    );
  }
  const rows = await db
    .select({
      id: teamAuditLog.id,
      action: teamAuditLog.action,
      subjectType: teamAuditLog.subjectType,
      subjectId: teamAuditLog.subjectId,
      metadata: teamAuditLog.metadata,
      createdAt: teamAuditLog.createdAt,
      actorUserId: teamAuditLog.actorUserId,
      actorKind: teamAuditLog.actorKind,
      actorName: user.name,
    })
    .from(teamAuditLog)
    .leftJoin(user, eq(user.id, teamAuditLog.actorUserId))
    .where(
      cursorCondition
        ? and(eq(teamAuditLog.teamId, teamId), cursorCondition)
        : eq(teamAuditLog.teamId, teamId),
    )
    .orderBy(desc(teamAuditLog.createdAt), desc(teamAuditLog.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    entries: page.map((row) => ({
      id: row.id,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      metadata: row.metadata,
      createdAt: row.createdAt,
      actorUserId: row.actorUserId,
      actorKind: row.actorKind,
      actorName: row.actorName ?? null,
    })),
    nextCursor: rows.length > limit && last ? `${last.createdAt.getTime()}|${last.id}` : null,
  };
}
