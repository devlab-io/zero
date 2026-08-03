/**
 * Rôles d'équipe (P17) — matrice de capacités PURE, unique source de vérité
 * des permissions par rôle. Les gardes structurelles (dernier owner, un admin
 * ne touche pas un owner, un member n'invite que des members…) restent dans
 * les stores : elles dépendent de l'état, pas du rôle seul.
 *
 * Sémantique des rôles :
 * - owner   : tout, y compris suppression d'équipe et gestion des owners.
 * - admin   : gestion complète SAUF suppression d'équipe et rôles owner/admin.
 * - member  : travail quotidien (partage, statut, commentaires, labels, ops).
 * - guest   : externe — ne voit QUE les fils explicitement accordés
 *             (team_thread_access) ; peut commenter/réagir/relire dessus,
 *             jamais partager, assigner ni voir ops/audit.
 * - auditor : lecture seule de supervision — fils en visibilité équipe, ops,
 *             journal d'audit et son export ; AUCUNE mutation.
 */

export const TEAM_ROLES = ['owner', 'admin', 'member', 'guest', 'auditor'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export type TeamCapability =
  | 'team.manage' // renommer, révoquer invites, retirer membres, SLA, rétention, rôles
  | 'team.delete' // owner seul
  | 'invite.create' // garde structurelle : un member n'invite que le rôle 'member'
  | 'thread.share'
  | 'thread.write' // statut, assignation, labels d'un fil, batch
  | 'comment.write'
  | 'reaction.write'
  | 'draft.review' // participer aux revues de brouillons (owner/reviewer)
  | 'label.manage' // créer/supprimer les labels d'équipe
  | 'rules.manage' // règles : mutations (lecture = audit.read)
  | 'ops.read'
  | 'audit.read'
  | 'audit.export'
  | 'data.export';

const ALL: readonly TeamCapability[] = [
  'team.manage',
  'team.delete',
  'invite.create',
  'thread.share',
  'thread.write',
  'comment.write',
  'reaction.write',
  'draft.review',
  'label.manage',
  'rules.manage',
  'ops.read',
  'audit.read',
  'audit.export',
  'data.export',
];

const MATRIX: Record<TeamRole, ReadonlySet<TeamCapability>> = {
  owner: new Set(ALL),
  admin: new Set(ALL.filter((capability) => capability !== 'team.delete')),
  member: new Set([
    'invite.create',
    'thread.share',
    'thread.write',
    'comment.write',
    'reaction.write',
    'draft.review',
    'label.manage',
    'ops.read',
    'audit.read',
  ]),
  guest: new Set(['comment.write', 'reaction.write', 'draft.review']),
  auditor: new Set(['ops.read', 'audit.read', 'audit.export']),
};

export function roleCan(role: TeamRole, capability: TeamCapability): boolean {
  return MATRIX[role]?.has(capability) ?? false;
}

/** Rôles visibles par l'ACL « visibilité équipe » (guest exclu — accès explicites seuls). */
export const TEAM_VISIBILITY_ROLES: readonly TeamRole[] = ['owner', 'admin', 'member', 'auditor'];

/** Rôles qui voient les fils RESTREINTS sans ligne d'accès explicite. */
export const RESTRICTED_OVERSEER_ROLES: readonly TeamRole[] = ['owner', 'admin'];

/**
 * Rôles qu'un acteur peut attribuer (invitation ou changement de rôle).
 * Owner : tout. Admin : jamais owner ni admin (l'escalade reste aux owners).
 * Member : n'invite que des members. Guest/auditor : rien.
 */
export function assignableRoles(actorRole: TeamRole): readonly TeamRole[] {
  switch (actorRole) {
    case 'owner':
      return TEAM_ROLES;
    case 'admin':
      return ['member', 'guest', 'auditor'];
    case 'member':
      return ['member'];
    default:
      return [];
  }
}

export function isTeamRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}
