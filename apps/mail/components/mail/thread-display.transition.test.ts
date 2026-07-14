import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { THREAD_TRANSITION_WRAPPER_CLASS } from './thread-display.transition';

// #44 supervisor QA correction #1 — the lazy motion split must keep the transition DOM box
// stable: the Suspense fallback and the resolved animated output must use the SAME wrapper
// element + classes. We enforce this by construction (a single shared constant) and prove
// both consumers reference it, so no future edit can silently diverge the fallback structure.
// (vitest cwd is apps/mail, so these repo-relative reads are stable.)
const SHARED = 'className={THREAD_TRANSITION_WRAPPER_CLASS}';
const animated = readFileSync(
  'components/mail/thread-display.animated-message-list.tsx',
  'utf8',
);
const host = readFileSync('components/mail/thread-display.tsx', 'utf8');

describe('thread-switch transition — fallback structural equivalence', () => {
  it('exposes the shared wrapper class constant', () => {
    expect(THREAD_TRANSITION_WRAPPER_CLASS).toBe('h-full w-full');
  });

  it('the animated wrapper (motion.div) uses the shared constant', () => {
    expect(animated).toContain('<motion.div');
    expect(animated).toContain(SHARED);
  });

  it('the Suspense fallback wrapper uses the same shared constant', () => {
    expect(host).toContain('fallback={');
    // The only wrapper class in thread-display.tsx bound to the shared constant is the fallback.
    expect(host).toContain(`<div ${SHARED}>`);
  });
});
