import {
  assignableRoles,
  isTeamRole,
  roleCan,
  RESTRICTED_OVERSEER_ROLES,
  TEAM_ROLES,
  TEAM_VISIBILITY_ROLES,
  type TeamCapability,
} from './team-roles';
import { describe, expect, it } from 'vitest';

describe('roleCan — matrice de capacités', () => {
  it('owner peut tout, admin tout sauf supprimer l’équipe', () => {
    expect(roleCan('owner', 'team.delete')).toBe(true);
    expect(roleCan('admin', 'team.delete')).toBe(false);
    expect(roleCan('admin', 'team.manage')).toBe(true);
    expect(roleCan('admin', 'rules.manage')).toBe(true);
    expect(roleCan('admin', 'data.export')).toBe(true);
  });

  it('member garde exactement le périmètre historique (pas de gestion, pas d’export)', () => {
    for (const allowed of [
      'invite.create',
      'thread.share',
      'thread.write',
      'comment.write',
      'label.manage',
      'ops.read',
      'audit.read',
    ] as TeamCapability[]) {
      expect(roleCan('member', allowed)).toBe(true);
    }
    for (const denied of [
      'team.manage',
      'team.delete',
      'rules.manage',
      'audit.export',
      'data.export',
    ] as TeamCapability[]) {
      expect(roleCan('member', denied)).toBe(false);
    }
  });

  it('guest ne peut que discuter sur ce qu’on lui a accordé', () => {
    expect(roleCan('guest', 'comment.write')).toBe(true);
    expect(roleCan('guest', 'reaction.write')).toBe(true);
    expect(roleCan('guest', 'draft.review')).toBe(true);
    for (const denied of [
      'thread.share',
      'thread.write',
      'invite.create',
      'label.manage',
      'ops.read',
      'audit.read',
      'data.export',
    ] as TeamCapability[]) {
      expect(roleCan('guest', denied)).toBe(false);
    }
  });

  it('auditor est strictement lecture seule, export d’audit inclus', () => {
    expect(roleCan('auditor', 'ops.read')).toBe(true);
    expect(roleCan('auditor', 'audit.read')).toBe(true);
    expect(roleCan('auditor', 'audit.export')).toBe(true);
    for (const denied of [
      'comment.write',
      'reaction.write',
      'draft.review',
      'thread.share',
      'thread.write',
      'invite.create',
      'label.manage',
      'team.manage',
      'data.export',
    ] as TeamCapability[]) {
      expect(roleCan('auditor', denied)).toBe(false);
    }
  });
});

describe('assignableRoles — anti-escalade', () => {
  it('admin ne peut jamais attribuer owner ni admin', () => {
    expect(assignableRoles('admin')).not.toContain('owner');
    expect(assignableRoles('admin')).not.toContain('admin');
    expect(assignableRoles('admin')).toEqual(['member', 'guest', 'auditor']);
  });
  it('member n’invite que des members ; guest et auditor rien', () => {
    expect(assignableRoles('member')).toEqual(['member']);
    expect(assignableRoles('guest')).toEqual([]);
    expect(assignableRoles('auditor')).toEqual([]);
  });
  it('owner attribue tous les rôles', () => {
    expect(assignableRoles('owner')).toEqual(TEAM_ROLES);
  });
});

describe('ensembles ACL', () => {
  it('guest est exclu de la visibilité équipe ; seuls owner/admin supervisent le restreint', () => {
    expect(TEAM_VISIBILITY_ROLES).not.toContain('guest');
    expect(TEAM_VISIBILITY_ROLES).toContain('auditor');
    expect(RESTRICTED_OVERSEER_ROLES).toEqual(['owner', 'admin']);
  });
  it('isTeamRole filtre les valeurs inconnues', () => {
    expect(isTeamRole('owner')).toBe(true);
    expect(isTeamRole('root')).toBe(false);
  });
});
