import { assignableRolesFor, canExportAudit, canManageTeam, canWorkThreads } from './team-roles-ui';
import { describe, expect, it } from 'vitest';

describe('team-roles-ui — affordances alignées sur la matrice serveur', () => {
  it('gestion : owner/admin seuls', () => {
    expect(canManageTeam('owner')).toBe(true);
    expect(canManageTeam('admin')).toBe(true);
    expect(canManageTeam('member')).toBe(false);
    expect(canManageTeam('guest')).toBe(false);
    expect(canManageTeam('auditor')).toBe(false);
    expect(canManageTeam(undefined)).toBe(false);
  });

  it('travail des fils : guest et auditor exclus', () => {
    expect(canWorkThreads('member')).toBe(true);
    expect(canWorkThreads('guest')).toBe(false);
    expect(canWorkThreads('auditor')).toBe(false);
  });

  it('export d’audit : auditor inclus, member exclu', () => {
    expect(canExportAudit('auditor')).toBe(true);
    expect(canExportAudit('member')).toBe(false);
  });

  it('anti-escalade : admin n’attribue ni owner ni admin ; guest/auditor rien', () => {
    expect(assignableRolesFor('owner')).toContain('owner');
    expect(assignableRolesFor('admin')).toEqual(['member', 'guest', 'auditor']);
    expect(assignableRolesFor('member')).toEqual(['member']);
    expect(assignableRolesFor('guest')).toEqual([]);
    expect(assignableRolesFor(undefined)).toEqual([]);
  });
});
