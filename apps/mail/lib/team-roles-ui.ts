/**
 * Affordances UI des rôles d'équipe (P17). Miroir MINIMAL de la matrice
 * serveur (apps/server .../team-roles.ts) — l'UI ne fait qu'afficher les
 * bonnes options ; le serveur reste l'unique autorité (toute divergence rend
 * un bouton inerte, jamais un droit).
 */

export type TeamRole = 'owner' | 'admin' | 'member' | 'guest' | 'auditor';

export const TEAM_ROLES: readonly TeamRole[] = ['owner', 'admin', 'member', 'guest', 'auditor'];

/** owner/admin : gestion d'équipe (rôles, rétention, exports, règles, SLA). */
export function canManageTeam(role: TeamRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Rôles porteurs de fils (assignation, statut, labels). */
export function canWorkThreads(role: TeamRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

/** audit.export : owner/admin/auditor. */
export function canExportAudit(role: TeamRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'auditor';
}

/**
 * Rôles attribuables par un acteur (invitation, changement de rôle) — même
 * règle anti-escalade que le serveur : un admin n'attribue jamais owner ni
 * admin, un member n'invite que des members.
 */
export function assignableRolesFor(actorRole: TeamRole | undefined): readonly TeamRole[] {
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
