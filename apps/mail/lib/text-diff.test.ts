import { diffLines, MAX_DIFF_LINES } from './text-diff';
import { describe, expect, it } from 'vitest';

describe('diffLines — LCS par lignes, borné', () => {
  it('marks unchanged, added and removed lines', () => {
    const { lines, bounded } = diffLines('a\nb\nc', 'a\nx\nc');
    expect(bounded).toBe(false);
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('handles pure additions and removals at the edges', () => {
    expect(diffLines('a', 'a\nb').lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
    expect(diffLines('a\nb', 'b').lines).toEqual([
      { kind: 'removed', text: 'a' },
      { kind: 'same', text: 'b' },
    ]);
  });

  it('identical inputs yield only same lines', () => {
    expect(diffLines('x\ny', 'x\ny').lines.every((line) => line.kind === 'same')).toBe(true);
  });

  it('falls back to a labeled full replacement beyond the line bound', () => {
    const big = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, index) => `l${index}`).join('\n');
    const { bounded, lines } = diffLines(big, 'court');
    expect(bounded).toBe(true);
    expect(lines.filter((line) => line.kind === 'added')).toHaveLength(1);
    expect(lines.filter((line) => line.kind === 'removed')).toHaveLength(MAX_DIFF_LINES + 1);
  });
});
