import { describe, expect, it } from 'vitest';
import { registerComposerFlush, type VisibilityDoc, type FlushTarget } from './composer-flush';

// Issue #34, check point 5 + soak invariant: flush listeners are balanced — every
// addEventListener is matched by a removeEventListener on cleanup (no leak).

interface Recorder extends FlushTarget {
  listeners: Map<string, () => void>;
  added: number;
  removed: number;
  emit(type: string): void;
}

function makeTarget(): Recorder {
  const listeners = new Map<string, () => void>();
  return {
    listeners,
    added: 0,
    removed: 0,
    addEventListener(type, listener) {
      listeners.set(type, listener);
      this.added++;
    },
    removeEventListener(type) {
      listeners.delete(type);
      this.removed++;
    },
    emit(type) {
      listeners.get(type)?.();
    },
  };
}

function makeDoc(visibilityState: string): Recorder & VisibilityDoc {
  return Object.assign(makeTarget(), { visibilityState });
}

describe('registerComposerFlush', () => {
  it('registers pagehide + visibilitychange and removes both on cleanup', () => {
    const win = makeTarget();
    const doc = makeDoc('visible');
    const cleanup = registerComposerFlush(win, doc, () => {});

    expect(win.listeners.has('pagehide')).toBe(true);
    expect(doc.listeners.has('visibilitychange')).toBe(true);

    cleanup();
    expect(win.added).toBe(win.removed);
    expect(doc.added).toBe(doc.removed);
    expect(win.listeners.size).toBe(0);
    expect(doc.listeners.size).toBe(0);
  });

  it('flushes on pagehide', () => {
    const win = makeTarget();
    const doc = makeDoc('visible');
    let flushed = 0;
    registerComposerFlush(win, doc, () => flushed++);
    win.emit('pagehide');
    expect(flushed).toBe(1);
  });

  it('flushes on visibilitychange only when hidden', () => {
    let flushed = 0;
    const visibleDoc = makeDoc('visible');
    registerComposerFlush(makeTarget(), visibleDoc, () => flushed++);
    visibleDoc.emit('visibilitychange');
    expect(flushed).toBe(0);

    const hiddenDoc = makeDoc('hidden');
    registerComposerFlush(makeTarget(), hiddenDoc, () => flushed++);
    hiddenDoc.emit('visibilitychange');
    expect(flushed).toBe(1);
  });

  it('stays balanced across many mount/unmount cycles (no leak)', () => {
    const win = makeTarget();
    const doc = makeDoc('visible');
    for (let i = 0; i < 1000; i++) {
      const cleanup = registerComposerFlush(win, doc, () => {});
      cleanup();
    }
    expect(win.listeners.size).toBe(0);
    expect(doc.listeners.size).toBe(0);
    expect(win.added).toBe(win.removed);
  });
});
