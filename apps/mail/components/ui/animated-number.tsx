// w2cd (client weight): rewritten off `motion/react` (useSpring/useTransform) to a
// small requestAnimationFrame tween. The visible behaviour — a number easing toward
// its target, rendered with locale grouping and tabular figures — is preserved without
// pulling framer/motion. The `springOptions` prop is dropped (it was a motion type and
// no call site used it).
//
// Mid-flight correctness: a new target must continue from the value CURRENTLY on
// screen, never snap back to a stale origin. The tween state lives in a pure animator
// (createNumberAnimator, in ./animated-number.tween) unit-tested with an injectable
// clock (see animated-number.test.ts).
import { useEffect, useRef, useState, type ElementType } from 'react';
import { createNumberAnimator } from './animated-number.tween';
import { cn } from '@/lib/utils';

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  as?: ElementType;
};

export function AnimatedNumber({ value, className, as = 'span' }: AnimatedNumberProps) {
  const Component = as;
  const [display, setDisplay] = useState(value);
  const animatorRef = useRef<ReturnType<typeof createNumberAnimator> | null>(null);
  if (animatorRef.current === null) animatorRef.current = createNumberAnimator(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const animator = animatorRef.current;
    if (!animator) return;
    animator.setTarget(value, performance.now());
    if (animator.isSettled()) {
      setDisplay(value);
      return;
    }

    const tick = (t: number) => {
      setDisplay(animator.frame(t));
      if (!animator.isSettled()) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <Component className={cn('tabular-nums', className)}>
      {Math.round(display).toLocaleString()}
    </Component>
  );
}
