import { getLocalActivityWindow } from './use-mailbox-overview';
import { describe, expect, it } from 'vitest';

describe('getLocalActivityWindow', () => {
  it('uses local midnight and Monday as stable activity boundaries', () => {
    const now = new Date(2026, 7, 1, 10, 25, 46);
    const window = getLocalActivityWindow(now);

    expect(new Date(window.todayStartMs)).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    expect(new Date(window.weekStartMs)).toEqual(new Date(2026, 6, 27, 0, 0, 0, 0));
  });

  it('starts a Sunday week on the preceding Monday', () => {
    const window = getLocalActivityWindow(new Date(2026, 7, 2, 12));
    expect(new Date(window.weekStartMs)).toEqual(new Date(2026, 6, 27, 0, 0, 0, 0));
  });
});
