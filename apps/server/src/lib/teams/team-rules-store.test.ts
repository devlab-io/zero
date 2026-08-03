import { previewRule, type RulePreviewCandidate } from './team-rules-store';
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import type { DB } from '../../db';

// Contrat source du store des règles (P14, durci) — même technique que
// team-comment-audit.test.ts : les invariants structurels non testables sans
// Postgres sont verrouillés sur le texte du module ; previewRule (une seule
// lecture SQL) est testé RÉELLEMENT sur un fake drizzle minimal.
const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'team-rules-store.ts'),
  'utf8',
);

describe('team rules store contract — authority', () => {
  it('every rule action executes as the rule CREATOR through existing store paths', () => {
    expect(source).toContain('shareThread(db, rule.createdBy');
    expect(source).toContain('setThreadAssignee(db, rule.createdBy');
    expect(source).toContain('setThreadLabels(db, rule.createdBy');
    expect(source).toContain('setThreadStatus(db, rule.createdBy');
  });

  it('a rule-driven share is team-wide, audited with rule provenance, never restricted', () => {
    expect(source).toContain("{ source: 'rule' as const, ruleId: rule.id, runId }");
    expect(source).not.toContain("visibility: 'restricted'");
  });

  it('rule mutations require rules.manage; reads require audit.read (guest exclu)', () => {
    const mutators = ['createRule', 'updateRule', 'setRuleEnabled', 'deleteRule', 'undoRuleRun'];
    for (const name of mutators) {
      const start = source.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const block = source.slice(start, source.indexOf('export async function', start + 1));
      // P17 : porte par CAPACITÉ (owner/admin via la matrice).
      expect(block, name).toContain('requireRulesManager');
    }
    const managerGate = source.slice(
      source.indexOf('async function requireRulesManager'),
      source.indexOf('async function requireRulesReader'),
    );
    expect(managerGate).toContain("roleCan(membership.role, 'rules.manage')");
    const listBlock = source.slice(
      source.indexOf('export async function listRules'),
      source.indexOf('export async function createRule'),
    );
    expect(listBlock).toContain('requireRulesReader');
    expect(listBlock).not.toContain('requireRulesManager');
    // L'aperçu lit des fils ENTIERS de la boîte de l'appelant : surface
    // d'AUTEUR de règles, même capacité que les mutations.
    const previewBlock = source.slice(
      source.indexOf('export async function previewRule'),
      source.indexOf('export async function requireAclConfirmation') > -1
        ? source.indexOf('export async function requireAclConfirmation')
        : source.indexOf(
            'export async function',
            source.indexOf('export async function previewRule') + 1,
          ),
    );
    expect(previewBlock).toContain('requireRulesManager');
  });
});

describe('team rules store contract — atomic idempotence (claim)', () => {
  it('claims via INSERT ON CONFLICT DO NOTHING + RETURNING before ANY effect', () => {
    const runBlock = source.slice(
      source.indexOf('export async function executeRulesForIncomingThread'),
      source.indexOf('// --- undo'),
    );
    const claimAt = runBlock.indexOf(
      '.onConflictDoNothing({ target: [teamRuleRun.ruleId, teamRuleRun.threadId] })',
    );
    const executeAt = runBlock.indexOf('executeActions(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(executeAt).toBeGreaterThan(claimAt);
    expect(runBlock).toContain('.returning({ id: teamRuleRun.id })');
    expect(runBlock).toContain('if (claimed.length === 0) continue;');
    expect(runBlock).toContain("outcome: 'processing'");
  });

  it('the SAME claimed run is updated to its final outcome on every path, including exceptions', () => {
    const runBlock = source.slice(
      source.indexOf('export async function executeRulesForIncomingThread'),
      source.indexOf('// --- undo'),
    );
    expect(runBlock).toContain(".set({ outcome: 'skipped', reason: skipReason })");
    expect(runBlock).toContain('.set({ outcome, reason, actionsApplied: records, teamThreadId })');
    expect(runBlock).toContain(".set({ outcome: 'error', reason: message })");
    // Plus aucun garde par SELECT préalable — le verrou unique arbitre.
    expect(runBlock).not.toContain('priorRuns');
  });
});

describe('team rules store contract — durable history (soft delete)', () => {
  it('deleteRule soft-deletes (deleted_at + disabled), never hard-deletes', () => {
    const block = source.slice(
      source.indexOf('export async function deleteRule'),
      source.indexOf('export async function listRuleRuns'),
    );
    expect(block).toContain('deletedAt: new Date()');
    expect(block).toContain('enabled: false');
    expect(block).not.toContain('db.delete(');
  });

  it('deleted rules are excluded from listing, execution and mutations by explicit SQL', () => {
    const listBlock = source.slice(
      source.indexOf('export async function listRules'),
      source.indexOf('export async function createRule'),
    );
    expect(listBlock).toContain('isNull(teamRule.deletedAt)');
    const execBlock = source.slice(
      source.indexOf('export async function executeRulesForIncomingThread'),
      source.indexOf('// --- undo'),
    );
    expect(execBlock).toContain('isNull(teamRule.deletedAt)');
    const requireRuleBlock = source.slice(
      source.indexOf('async function requireRule'),
      source.indexOf('export async function updateRule'),
    );
    expect(requireRuleBlock).toContain('isNull(teamRule.deletedAt)');
  });

  it('run history keeps joining soft-deleted rules by name, and undo still works for them', () => {
    const runsBlock = source.slice(
      source.indexOf('export async function listRuleRuns'),
      source.indexOf('// --- simulation'),
    );
    expect(runsBlock).toContain('innerJoin(teamRule');
    expect(runsBlock).not.toContain('isNull(teamRule.deletedAt)');
    const undoBlock = source.slice(source.indexOf('export async function undoRuleRun'));
    // Lecture directe de la règle, sans le filtre deleted_at des mutations.
    expect(undoBlock).toContain('.from(teamRule).where(eq(teamRule.id, run.ruleId))');
  });
});

describe('team rules store contract — ACL confirmation on all three paths', () => {
  it('create, update (resulting actions) and re-enable all call requireAclConfirmation', () => {
    for (const name of ['createRule', 'updateRule', 'setRuleEnabled']) {
      const start = source.indexOf(`export async function ${name}`);
      const block = source.slice(start, source.indexOf('export async function', start + 1));
      expect(block, name).toContain('requireAclConfirmation(');
    }
    // update vérifie la règle RÉSULTANTE, pas seulement le patch.
    expect(source).toContain('requireAclConfirmation(actions ?? rule.actions');
    // re-enable seulement (désactiver ne demande rien).
    expect(source).toContain('if (enabled) requireAclConfirmation(rule.actions');
  });
});

describe('team rules store contract — safe conditional undo', () => {
  const undoBlock = source.slice(source.indexOf('export async function undoRuleRun'));

  it('preflights EVERY condition before any mutation, and conflicts mutate nothing', () => {
    const preflightAt = undoBlock.indexOf('--- PRÉFLIGHT');
    const executeAt = undoBlock.indexOf('--- EXÉCUTION');
    const conflictReturnAt = undoBlock.indexOf(
      "return { status: 'conflicted', conflicts, undone: [] }",
    );
    expect(preflightAt).toBeGreaterThan(-1);
    expect(conflictReturnAt).toBeGreaterThan(preflightAt);
    expect(conflictReturnAt).toBeLessThan(executeAt);
    expect(undoBlock).toContain("action: 'rule.undo_conflicted'");
  });

  it('team-state inverses require the CURRENT state to equal the state applied by this run', () => {
    expect(undoBlock).toContain("conflicts.push('assign: the assignee changed since this run')");
    expect(undoBlock).toContain("conflicts.push('todo: the status changed since this run')");
    expect(undoBlock).toContain("conflicts.push('label: the labels changed since this run')");
  });

  it('unshare of a rule-created share is refused on any comment or run-foreign activity', () => {
    expect(undoBlock).toContain('share: the thread received comments since this run');
    expect(undoBlock).toContain('share: the thread has activity since this run');
    // PostgreSQL timestamps can share the same stored precision: equality must
    // still be treated as post-claim activity and filtered by exact run
    // provenance, never silently ignored.
    expect(undoBlock).toContain('gte(teamThreadComment.createdAt, run.createdAt)');
    expect(undoBlock).toContain('gte(teamAuditLog.createdAt, run.createdAt)');
    // Filtre par PROVENANCE (source rule + runId exact), plus jamais par
    // acteur : l'action manuelle du créateur lui-même est bloquante.
    expect(undoBlock).toContain('isRunForeignActivity(entry, runId)');
    expect(undoBlock).not.toContain('ne(teamAuditLog.actorUserId');
  });

  it('every team mutation of a run carries the {source, ruleId, runId} provenance context', () => {
    const execBlock = source.slice(
      source.indexOf('async function executeActions'),
      source.indexOf('export type IncomingRuleRun'),
    );
    expect(execBlock).toContain(
      "const context = { source: 'rule' as const, ruleId: rule.id, runId }",
    );
    expect(execBlock).toContain(
      'setThreadAssignee(db, rule.createdBy, teamThreadId, action.userId, context)',
    );
    expect(execBlock).toContain(
      'setThreadLabels(db, rule.createdBy, teamThreadId, union, context)',
    );
    expect(execBlock).toContain(
      "setThreadStatus(db, rule.createdBy, teamThreadId, 'open', context)",
    );
    // Le share porte la même provenance complète (runId inclus).
    expect(execBlock).toMatch(/accessUserIds: \[\],\s*\n\s*context,/);
  });

  it('snooze undo checks the CURRENT KV value against the applied wakeAt via snoozeGet', () => {
    expect(undoBlock).toContain('await effects.snoozeGet(key)');
    expect(undoBlock).toContain('snooze: the snooze changed since this run');
  });

  it('inverses run in REVERSE order and any execution failure prevents undone', () => {
    expect(undoBlock).toContain('[...okRecords].reverse()');
    expect(undoBlock).toContain("action: 'rule.undo_failed'");
    expect(undoBlock).toContain("return { status: 'failed', conflicts: [], undone }");
    // 'undone' n'est posé qu'après la boucle complète des inverses.
    const undoneUpdateAt = undoBlock.indexOf("outcome: 'undone', undoneAt: new Date()");
    const reverseLoopAt = undoBlock.indexOf('[...okRecords].reverse()');
    expect(undoneUpdateAt).toBeGreaterThan(reverseLoopAt);
  });

  it('only applied runs are undoable', () => {
    expect(undoBlock).toContain(
      "if (run.outcome !== 'applied') throw new TeamStoreError('run_not_undoable')",
    );
  });
});

describe('team rules store contract — exposure', () => {
  it('filters rule-run history through the thread ACL and keeps unshared runs creator-only', () => {
    const runsBlock = source.slice(
      source.indexOf('export async function listRuleRuns'),
      source.indexOf('// --- simulation'),
    );
    expect(runsBlock).toContain('accessPredicate(userId)');
    expect(runsBlock).toContain('eq(teamRuleRun.actorUserId, userId)');
  });

  it('the per-thread filter (Team panel “why assigned”) sits INSIDE the same ACL gate', () => {
    const runsBlock = source.slice(
      source.indexOf('export async function listRuleRuns'),
      source.indexOf('// --- simulation'),
    );
    const aclAt = runsBlock.indexOf(
      'or(eq(teamRuleRun.actorUserId, userId), accessPredicate(userId))',
    );
    const threadFilterAt = runsBlock.indexOf('eq(teamRuleRun.teamThreadId, options.teamThreadId)');
    // Le filtre par fil est une CONDITION SUPPLÉMENTAIRE du même AND que la
    // porte ACL — jamais un chemin de contournement.
    expect(aclAt).toBeGreaterThan(-1);
    expect(threadFilterAt).toBeGreaterThan(aclAt);
  });

  it('the watched connectionId never crosses to the client', () => {
    const publicBlock = source.slice(
      source.indexOf('function toPublicRule'),
      source.indexOf('export async function listRules'),
    );
    expect(publicBlock).not.toContain('connectionId');
    // listRuleRuns masque inverse ET applied (états internes de l'undo).
    expect(source).toContain('inverse: _inverse');
    expect(source).toContain('applied: _applied');
  });

  it('snooze uses the same KV key shape as the mail routes', () => {
    expect(source).toContain('`${threadId}__${connectionId}`');
  });
});

// --- provenance côté team-store : contexte optionnel, contrat manuel intact ---

const teamStoreSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'team-store.ts'),
  'utf8',
);

describe('team store contract — optional rule provenance on thread mutations', () => {
  it('setThreadStatus/Assignee/Labels accept an optional RuleActionContext merged into audit metadata', () => {
    expect(teamStoreSource).toMatch(/metadata:\s*\{\s*status,\s*\.\.\.context\s*\}/);
    expect(teamStoreSource).toMatch(/metadata:\s*\{\s*assigneeUserId,\s*\.\.\.context\s*\}/);
    expect(teamStoreSource).toMatch(/metadata:\s*\{\s*labelIds:\s*unique,\s*\.\.\.context\s*\}/);
  });

  it('without a context, the manual audit contract is byte-identical (empty spread)', () => {
    // Le paramètre est OPTIONNEL sur les trois setters : les appels manuels
    // existants ne changent pas, et l'object spread de `undefined` n'ajoute rien.
    for (const name of ['setThreadStatus', 'setThreadAssignee', 'setThreadLabels']) {
      const start = teamStoreSource.indexOf(`export async function ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const signature = teamStoreSource.slice(start, teamStoreSource.indexOf('{', start));
      expect(signature, name).toContain('context?: RuleActionContext');
    }
  });

  it('the rule share audit carries the full provenance including runId', () => {
    expect(teamStoreSource).toContain(
      "export type RuleActionContext = { source: 'rule'; ruleId: string; runId: string }",
    );
    // shareThread fusionne le contexte entier ({source, ruleId, runId}).
    expect(teamStoreSource).toMatch(/\.\.\.options\.context/);
  });
});

// --- previewRule : test RÉEL (une seule lecture SQL, fake drizzle minimal) ---

// P17 : l'aperçu exige rules.manage — le fake porte un rôle owner ; un rôle
// member est refusé (test dédié plus bas).
const roleDb = (role: string) =>
  ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ role }] }),
      }),
    }),
  }) as unknown as DB;
const membershipDb = roleDb('owner');

const candidate = (threadId: string, meta: RulePreviewCandidate['meta']): RulePreviewCandidate => ({
  threadId,
  subject: meta?.subject ?? 'unreadable',
  senderEmail: meta?.senderEmail ?? '',
  meta,
});

describe('previewRule — exact, read-only evaluation', () => {
  it('matches recipients from real To/Cc and keywords present ONLY in the body', async () => {
    const rows = await previewRule(
      membershipDb,
      'user-1',
      'team-1',
      { triggers: { recipients: ['omar@devlab.io'], keywords: ['surcharge'] } },
      [
        candidate('th-1', {
          senderEmail: 'client@ext.pf',
          recipients: ['sales@devlab.io', 'omar@devlab.io'],
          subject: 'Renewal quote',
          bodyText: 'can you confirm the freight surcharge before Friday?',
          gmailLabels: ['INBOX'],
          receivedOn: '2026-08-03T09:30:00.000Z',
        }),
        candidate('th-2', {
          senderEmail: 'client@ext.pf',
          recipients: ['other@devlab.io'],
          subject: 'Renewal quote',
          bodyText: 'no keyword here',
          gmailLabels: ['INBOX'],
          receivedOn: '2026-08-03T09:30:00.000Z',
        }),
      ],
    );
    expect(rows[0]?.verdict).toMatchObject({ matched: true, partial: false });
    expect(rows[1]?.verdict?.matched).toBe(false);
    // Plus AUCUNE famille « non évaluable » : l'évaluation est exacte.
    expect(rows[0]?.verdict?.reasons.every((reason) => !reason.unavailable)).toBe(true);
  });

  it('a failed thread read yields verdict null (not evaluated), never a non-match', async () => {
    const rows = await previewRule(
      membershipDb,
      'user-1',
      'team-1',
      { triggers: { keywords: ['anything'] } },
      [candidate('th-broken', null)],
    );
    expect(rows[0]?.verdict).toBeNull();
  });

  it('P17 : un simple member est refusé — l’aperçu est une surface d’auteur de règles', async () => {
    await expect(
      previewRule(roleDb('member'), 'user-1', 'team-1', { triggers: {} }, []),
    ).rejects.toThrow('forbidden');
  });
});
