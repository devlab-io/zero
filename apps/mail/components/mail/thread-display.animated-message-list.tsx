import { AnimatePresence, motion } from 'motion/react';
import type { ComponentProps } from 'react';

import { MessageList } from './thread-display.message-list';
import { THREAD_TRANSITION_WRAPPER_CLASS } from './thread-display.transition';

// #44 (gate A8, JS critique inbox): the motion-powered thread-switch transition is split into
// this lazily-loaded sibling so the `motion` chunk (~41.5 KB gz) can leave the /mail/inbox
// critical modulepreload closure (fully realised once its other anchors — icons/theme/nav-user
// — are also de-anchored; see report). The rendered markup and the animation parameters here
// match the previous inline AnimatePresence + motion.div wrapper: same key, entry/exit offsets,
// transition curve, onAnimationComplete, and the shared wrapper class. What changes is load
// timing: the chunk resolves when a thread is first shown with animations on (via thread-
// display's Suspense boundary), and while it resolves a structurally-equivalent fallback is
// rendered (a <div> using the same THREAD_TRANSITION_WRAPPER_CLASS around the same MessageList).
// After the chunk resolves the transition is functionally equivalent to before; the observable
// difference is that a thread rendered before the chunk resolves shows no entry animation.
type AnimatedMessageListProps = {
  threadKey: string;
  navigationDirection: 'previous' | 'next' | null;
  onAnimationComplete: () => void;
  messageListProps: ComponentProps<typeof MessageList>;
};

export default function AnimatedMessageList({
  threadKey,
  navigationDirection,
  onAnimationComplete,
  messageListProps,
}: AnimatedMessageListProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={threadKey}
        initial={{
          opacity: 0,
          x: navigationDirection === 'previous' ? -25 : navigationDirection === 'next' ? 25 : 0,
        }}
        animate={{
          opacity: 1,
          x: 0,
        }}
        exit={{
          opacity: 0,
          x: navigationDirection === 'previous' ? 25 : navigationDirection === 'next' ? -25 : 0,
        }}
        transition={{
          duration: 0.08,
          ease: [0.4, 0, 0.2, 1],
        }}
        onAnimationComplete={onAnimationComplete}
        className={THREAD_TRANSITION_WRAPPER_CLASS}
      >
        <MessageList {...messageListProps} />
      </motion.div>
    </AnimatePresence>
  );
}
