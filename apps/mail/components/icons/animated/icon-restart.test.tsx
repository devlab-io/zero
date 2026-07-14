import { describe, expect, it } from 'vitest';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';

import { MoonIcon, type MoonIconHandle } from './moon';
import { SunIcon, type SunIconHandle } from './sun';
import { SquarePenIcon, type SquarePenIconHandle } from './square-pen';

// #44 supervisor audit — the de-motioned icons keep the imperative handle contract: startAnimation
// must RESTART the animation on every call, even when already running (the old motion controls.start
// did). The runId counter keys the animated element, so each start remounts it. We prove two
// startAnimation calls produce two distinct remounts (a one-shot CSS class would not restart).
// (Visual parity is not asserted here — that is functional-equivalence, not pixel-verified.)
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('animated icon restart (runId)', () => {
  it('MoonIcon.startAnimation remounts the animated <svg> on each call', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);
    const ref = createRef<MoonIconHandle>();
    act(() => root.render(<MoonIcon ref={ref} />));

    const svg0 = c.querySelector('svg');
    act(() => ref.current!.startAnimation());
    const svg1 = c.querySelector('svg');
    act(() => ref.current!.startAnimation());
    const svg2 = c.querySelector('svg');

    expect(svg0).not.toBeNull();
    expect(svg1).not.toBe(svg0); // first start → keyed remount
    expect(svg2).not.toBe(svg1); // second start → remount again ⇒ repeatable restart
    // stopAnimation returns to the resting element (no error, still an <svg>).
    act(() => ref.current!.stopAnimation());
    expect(c.querySelector('svg')).not.toBeNull();

    act(() => root.unmount());
    c.remove();
  });

  it('SunIcon.startAnimation remounts the animated rays on each call', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);
    const ref = createRef<SunIconHandle>();
    act(() => root.render(<SunIcon ref={ref} />));

    const ray0 = c.querySelectorAll('path')[0];
    act(() => ref.current!.startAnimation());
    const ray1 = c.querySelectorAll('path')[0];
    act(() => ref.current!.startAnimation());
    const ray2 = c.querySelectorAll('path')[0];

    expect(ray1).not.toBe(ray0);
    expect(ray2).not.toBe(ray1);

    act(() => root.unmount());
    c.remove();
  });

  it('SquarePenIcon.startAnimation remounts the animated pen path on each call', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);
    const ref = createRef<SquarePenIconHandle>();
    act(() => root.render(<SquarePenIcon ref={ref} />));

    // The animated element is the pen path (d starts with "M18.375"), not the static frame path.
    const penPath = () =>
      Array.from(c.querySelectorAll('path')).find((p) =>
        (p.getAttribute('d') ?? '').startsWith('M18.375'),
      );
    const pen0 = penPath();
    act(() => ref.current!.startAnimation());
    const pen1 = penPath();
    act(() => ref.current!.startAnimation());
    const pen2 = penPath();

    expect(pen0).toBeTruthy();
    expect(pen1).not.toBe(pen0);
    expect(pen2).not.toBe(pen1);

    act(() => root.unmount());
    c.remove();
  });
});
