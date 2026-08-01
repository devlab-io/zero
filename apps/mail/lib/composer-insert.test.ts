import { insertIntoComposer, registerComposerInsertHandler } from './composer-insert';
import { describe, expect, it, vi } from 'vitest';

describe('composer-insert seam — live insertion without silent overwrite', () => {
  it('routes to the handler registered under the exact scope key', () => {
    const handler = vi.fn(() => 'inserted' as const);
    const unregister = registerComposerInsertHandler('zero:composer-draft:t=abc', handler);

    expect(insertIntoComposer('zero:composer-draft:t=abc', { message: '<p>x</p>' })).toBe(
      'inserted',
    );
    expect(insertIntoComposer('zero:composer-draft:compose', { message: '<p>x</p>' })).toBe(
      'no-composer',
    );
    unregister();
    expect(insertIntoComposer('zero:composer-draft:t=abc', { message: '<p>x</p>' })).toBe(
      'no-composer',
    );
  });

  it("reports 'occupied' untouched and only forces when asked", () => {
    let body = 'existing content';
    const unregister = registerComposerInsertHandler('key', (payload, { force }) => {
      if (!force && body.trim()) return 'occupied';
      body = payload.message;
      return 'inserted';
    });

    expect(insertIntoComposer('key', { message: 'proposal' })).toBe('occupied');
    expect(body).toBe('existing content');
    expect(insertIntoComposer('key', { message: 'proposal' }, { force: true })).toBe('inserted');
    expect(body).toBe('proposal');
    unregister();
  });

  it('a remount with the same key replaces the previous handler', () => {
    const first = vi.fn(() => 'inserted' as const);
    const second = vi.fn(() => 'inserted' as const);
    const unregisterFirst = registerComposerInsertHandler('key2', first);
    registerComposerInsertHandler('key2', second);
    insertIntoComposer('key2', { message: 'x' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    // The stale unregister must not remove the new handler.
    unregisterFirst();
    expect(insertIntoComposer('key2', { message: 'y' })).toBe('inserted');
  });
});
