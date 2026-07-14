// #44 (gate A8): shared wrapper class for the thread-switch transition, kept in its own
// motion-free module so BOTH the lazily-loaded animated wrapper (thread-display.animated-
// message-list.tsx, which imports motion) AND thread-display's Suspense fallback can reference
// the SAME constant without pulling motion into the critical inbox chunk. This makes the
// fallback and the resolved animated output structurally equivalent by construction.
export const THREAD_TRANSITION_WRAPPER_CLASS = 'h-full w-full';
