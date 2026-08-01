import { formatSavedTime } from './inbox-dashboard';
import { describe, expect, it } from 'vitest';

describe('formatSavedTime', () => {
  it('formats minutes and mixed hour values compactly', () => {
    expect(formatSavedTime(18)).toBe('18 min');
    expect(formatSavedTime(60)).toBe('1h');
    expect(formatSavedTime(138)).toBe('2h 18m');
  });
});
