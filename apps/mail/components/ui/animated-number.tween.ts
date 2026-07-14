// w2cd (client weight): pure tween state for <AnimatedNumber>, extracted so the
// mid-flight correctness can be unit-tested with an injected clock (no React, no rAF,
// no path aliases — see animated-number.test.ts).

export const DURATION = 500; // ms — spring-like settle

export const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

// Pure, injectable-clock tween value.
export function tweenValue(from: number, to: number, elapsed: number, duration = DURATION): number {
  const p = Math.min(1, Math.max(0, elapsed / duration));
  return from + (to - from) * easeOutCubic(p);
}

// Pure animator. `setTarget` ALWAYS starts the new tween from the value currently on
// screen (`displayed`), so a target change mid-flight continues smoothly instead of
// jumping back to the previous origin. `frame(now)` advances against an injected clock,
// which makes the mid-course behaviour deterministically testable without real rAF.
export function createNumberAnimator(initial: number, duration = DURATION) {
  let displayed = initial;
  let from = initial;
  let to = initial;
  let startTime: number | null = null;
  return {
    setTarget(target: number, now: number) {
      if (target === displayed) {
        to = target;
        startTime = null;
        return;
      }
      from = displayed; // <-- start from what's on screen, not a stale origin
      to = target;
      startTime = now;
    },
    frame(now: number): number {
      if (startTime === null) return displayed;
      const elapsed = now - startTime;
      displayed = tweenValue(from, to, elapsed, duration);
      if (elapsed >= duration) {
        displayed = to;
        startTime = null;
      }
      return displayed;
    },
    isSettled() {
      return startTime === null;
    },
    get displayed() {
      return displayed;
    },
  };
}
