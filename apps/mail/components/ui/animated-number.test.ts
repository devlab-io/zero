import { describe, expect, it } from 'vitest';

import { createNumberAnimator, tweenValue } from './animated-number.tween';

// The animator is driven by requestAnimationFrame in the component; here we drive it
// with an injected clock (fake rAF) so mid-course behaviour is deterministic.
const DURATION = 500;

describe('tweenValue', () => {
  it('is clamped and monotonic from `from` to `to`', () => {
    expect(tweenValue(0, 100, 0)).toBe(0);
    expect(tweenValue(0, 100, DURATION)).toBe(100);
    expect(tweenValue(0, 100, DURATION * 2)).toBe(100); // clamped past duration
    const a = tweenValue(0, 100, 100);
    const b = tweenValue(0, 100, 250);
    expect(b).toBeGreaterThan(a);
  });
});

describe('createNumberAnimator', () => {
  it('eases toward the target and settles exactly on it', () => {
    const anim = createNumberAnimator(0);
    anim.setTarget(100, 0);
    expect(anim.frame(0)).toBe(0);
    const mid = anim.frame(250);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(anim.isSettled()).toBe(false);
    expect(anim.frame(DURATION)).toBe(100); // exact settle
    expect(anim.isSettled()).toBe(true);
  });

  // Regression for the mid-flight jump-back bug: if `value` changes before the current
  // tween finishes, the next tween MUST continue from the value on screen — not restart
  // from the previous origin (which produced a visible backward jump).
  it('continues from the on-screen value when the target changes mid-flight (no backward jump)', () => {
    const anim = createNumberAnimator(0);

    // First tween 0 -> 100, advance partway.
    anim.setTarget(100, 0);
    const mid = anim.frame(250);
    expect(mid).toBeGreaterThan(0);
    expect(anim.isSettled()).toBe(false);

    // Mid-course: retarget to 200 at t=250 (before the first tween finished).
    anim.setTarget(200, 250);

    // The very first frame of the new tween must NOT drop below where we were.
    const next = anim.frame(255);
    expect(next).toBeGreaterThanOrEqual(mid); // GREEN after fix; would be ~0 (< mid) before it

    // And it keeps climbing toward the new target, settling exactly on 200.
    expect(anim.frame(300)).toBeGreaterThanOrEqual(next);
    expect(anim.frame(250 + DURATION)).toBe(200);
    expect(anim.isSettled()).toBe(true);
  });

  it('never jumps backward across a downward retarget mid-flight either', () => {
    const anim = createNumberAnimator(0);
    anim.setTarget(1000, 0);
    const mid = anim.frame(250); // climbed well above 0
    anim.setTarget(10, 250); // retarget DOWN mid-flight
    const next = anim.frame(255);
    // Moving toward 10 from `mid` (~875) means decreasing, but the FIRST step must start
    // at `mid`, not snap to the stale origin (0) and then rise — i.e. continuous.
    expect(next).toBeLessThanOrEqual(mid);
    expect(next).toBeGreaterThan(10);
    expect(anim.frame(250 + DURATION)).toBe(10);
  });

  it('settles immediately when retargeted to the current value', () => {
    const anim = createNumberAnimator(42);
    anim.setTarget(42, 0);
    expect(anim.isSettled()).toBe(true);
    expect(anim.frame(100)).toBe(42);
  });
});
