import { resolveMailSelectMode, type MailSelectionModifiers } from './use-mail-selection';
import { describe, expect, it } from 'vitest';

const plainClick: MailSelectionModifiers = {
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
};

describe('resolveMailSelectMode', () => {
  it('uses the real plain-click modifiers even if the global Meta state is stale', () => {
    expect(resolveMailSelectMode(plainClick, (key) => key === 'Meta')).toBe('single');
  });

  it('preserves explicit click modifiers for mass and range selection', () => {
    expect(resolveMailSelectMode({ ...plainClick, metaKey: true }, (key) => key === 'Meta')).toBe(
      'mass',
    );
    expect(resolveMailSelectMode({ ...plainClick, shiftKey: true }, (key) => key === 'Shift')).toBe(
      'range',
    );
  });

  it('ignores a phantom modifier carried only by an accessibility click', () => {
    expect(resolveMailSelectMode({ ...plainClick, metaKey: true }, () => false)).toBe('single');
  });

  it('falls back to keyboard state when no pointer event is available', () => {
    expect(resolveMailSelectMode(undefined, (key) => key === 'Control')).toBe('mass');
    expect(resolveMailSelectMode(undefined, (key) => key === 'Shift')).toBe('range');
  });
});
