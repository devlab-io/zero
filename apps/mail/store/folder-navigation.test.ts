import { shouldMaskPendingMailFolder } from './folder-navigation';
import { describe, expect, it } from 'vitest';

describe('folder navigation visual gate', () => {
  it('masks the old folder only until the target route renders', () => {
    expect(shouldMaskPendingMailFolder('bin', 'inbox')).toBe(true);
    expect(shouldMaskPendingMailFolder('bin', 'bin')).toBe(false);
    expect(shouldMaskPendingMailFolder(null, 'inbox')).toBe(false);
  });
});
