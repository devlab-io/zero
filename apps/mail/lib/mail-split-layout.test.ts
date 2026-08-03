import {
  getMailSplitLayout,
  mailSplitAutoSaveId,
  shouldFocusReaderWithWorkspace,
} from './mail-split-layout';
import { describe, expect, it } from 'vitest';

describe('mail split reader layout', () => {
  it('uses the whole canvas while no thread is open', () => {
    expect(getMailSplitLayout(false, false)).toEqual({
      listDefault: 100,
      listMin: 100,
      listMax: 100,
    });
  });

  it('compacts the list and gives the reader most of a wide desktop', () => {
    expect(getMailSplitLayout(true, false)).toEqual({
      listDefault: 24,
      listMin: 20,
      listMax: 38,
      readerDefault: 76,
      readerMin: 50,
    });
  });

  it('keeps the clickable list usable on a narrower desktop', () => {
    expect(getMailSplitLayout(true, true)).toEqual({
      listDefault: 38,
      listMin: 32,
      listMax: 48,
      readerDefault: 62,
      readerMin: 52,
    });
  });

  it('stores compact and wide user-resized ratios independently', () => {
    expect(mailSplitAutoSaveId(false)).not.toBe(mailSplitAutoSaveId(true));
  });

  it('focuses the reader when the workspace shares a compact desktop', () => {
    expect(shouldFocusReaderWithWorkspace(true, true, true)).toBe(true);
    expect(shouldFocusReaderWithWorkspace(false, true, true)).toBe(false);
    expect(shouldFocusReaderWithWorkspace(true, false, true)).toBe(false);
    expect(shouldFocusReaderWithWorkspace(true, true, false)).toBe(false);
  });
});
