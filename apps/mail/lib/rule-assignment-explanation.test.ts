import { assignmentExplanation, type RuleRunSummary } from './rule-assignment-explanation';
import { describe, expect, it } from 'vitest';

const run = (overrides: Partial<RuleRunSummary>): RuleRunSummary => ({
  id: 'r1',
  ruleName: 'Partage clients',
  outcome: 'applied',
  reason: 'domains: ✓ sender domain client.pf is listed',
  createdAt: '2026-08-02T10:00:00.000Z',
  actionsApplied: [{ kind: 'assign', ok: true }],
  ...overrides,
});

describe('assignmentExplanation', () => {
  it('returns the LATEST applied run with a successful assign or todo action', () => {
    const result = assignmentExplanation([
      run({ id: 'old', createdAt: '2026-08-01T10:00:00.000Z', ruleName: 'Ancienne' }),
      run({ id: 'new', createdAt: '2026-08-02T10:00:00.000Z', ruleName: 'Récente' }),
      run({
        id: 'todo',
        createdAt: '2026-08-01T12:00:00.000Z',
        actionsApplied: [{ kind: 'todo', ok: true }],
      }),
    ]);
    expect(result).toEqual({
      ruleName: 'Récente',
      reason: 'domains: ✓ sender domain client.pf is listed',
    });
  });

  it('ignores undone/error/processing runs, failed actions and non-assign actions', () => {
    expect(
      assignmentExplanation([
        run({ outcome: 'undone' }),
        run({ outcome: 'error' }),
        run({ outcome: 'processing' }),
        run({ actionsApplied: [{ kind: 'assign', ok: false }] }),
        run({ actionsApplied: [{ kind: 'share', ok: true }] }),
      ]),
    ).toBeNull();
    expect(assignmentExplanation([])).toBeNull();
  });
});
