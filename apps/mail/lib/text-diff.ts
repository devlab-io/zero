/**
 * Diff TEXTE par lignes (P15, comparaison avant/après d'une suggestion) —
 * LCS classique, pur, borné : au-delà de MAX_DIFF_LINES lignes d'un côté, on
 * renvoie un remplacement complet libellé (pas de faux diff partiel).
 */

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

export const MAX_DIFF_LINES = 400;

export function diffLines(before: string, after: string): { lines: DiffLine[]; bounded: boolean } {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return {
      bounded: true,
      lines: [
        ...a.map((text) => ({ kind: 'removed' as const, text })),
        ...b.map((text) => ({ kind: 'added' as const, text })),
      ],
    };
  }
  // LCS par programmation dynamique — O(n·m), borné à 400×400.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ kind: 'removed', text: a[i]! });
      i++;
    } else {
      lines.push({ kind: 'added', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) lines.push({ kind: 'removed', text: a[i++]! });
  while (j < b.length) lines.push({ kind: 'added', text: b[j++]! });
  return { lines, bounded: false };
}
