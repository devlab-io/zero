import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, createRef } from 'react';

import { SquarePenIcon, type SquarePenIconHandle } from './square-pen';
import { MoonIcon, type MoonIconHandle } from './moon';
import { SunIcon, type SunIconHandle } from './sun';

// #44 supervisor audit — the de-motioned icons retain imperative feedback without decorative
// keyframes: startAnimation exposes a brief active state, then returns to rest.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('animated icon feedback', () => {
  it('MoonIcon.startAnimation exposes a brief reduced-motion-safe active state', () => {
    vi.useFakeTimers();
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);
    const ref = createRef<MoonIconHandle>();
    act(() => root.render(<MoonIcon ref={ref} />));

    act(() => ref.current!.startAnimation());
    const svg = c.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('scale-95');
    expect(svg?.getAttribute('class')).toContain('motion-reduce:transition-none');
    act(() => vi.advanceTimersByTime(200));
    expect(svg?.getAttribute('class')).toContain('scale-100');

    act(() => root.unmount());
    c.remove();
    vi.useRealTimers();
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

  it('SquarePenIcon.startAnimation uses the same brief active state', () => {
    vi.useFakeTimers();
    const c = document.createElement('div');
    document.body.appendChild(c);
    const root = createRoot(c);
    const ref = createRef<SquarePenIconHandle>();
    act(() => root.render(<SquarePenIcon ref={ref} />));

    act(() => ref.current!.startAnimation());
    const svg = c.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('scale-95');
    expect(svg?.getAttribute('class')).toContain('motion-reduce:transition-none');
    act(() => vi.advanceTimersByTime(200));
    expect(svg?.getAttribute('class')).toContain('scale-100');

    act(() => root.unmount());
    c.remove();
    vi.useRealTimers();
  });
});
