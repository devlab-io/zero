import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { useSecondaryQueriesEnabled } from './use-secondary-queries';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: boolean | null = null;
function Probe() {
  latest = useSecondaryQueriesEnabled();
  return null;
}

const idleWindow = window as unknown as {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const fakeDeadline: IdleDeadline = { didTimeout: false, timeRemaining: () => 50 };

describe('useSecondaryQueriesEnabled — secondary queries yield to the critical path', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    latest = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete idleWindow.requestIdleCallback;
    delete idleWindow.cancelIdleCallback;
    vi.useRealTimers();
  });

  it('waits for the grace period, then enables once the browser goes idle', () => {
    vi.useFakeTimers();
    const idleCallbacks: IdleRequestCallback[] = [];
    idleWindow.requestIdleCallback = (callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    };
    idleWindow.cancelIdleCallback = () => {};

    act(() => root.render(<Probe />));
    expect(latest).toBe(false);

    act(() => void vi.advanceTimersByTime(299));
    expect(idleCallbacks).toHaveLength(0);
    expect(latest).toBe(false);

    act(() => void vi.advanceTimersByTime(1));
    expect(idleCallbacks).toHaveLength(1);
    expect(latest).toBe(false);

    act(() => idleCallbacks.forEach((callback) => callback(fakeDeadline)));
    expect(latest).toBe(true);
  });

  it('falls back to a short timeout when requestIdleCallback is unavailable', () => {
    vi.useFakeTimers();

    act(() => root.render(<Probe />));
    expect(latest).toBe(false);

    act(() => void vi.advanceTimersByTime(299));
    expect(latest).toBe(false);

    act(() => void vi.advanceTimersByTime(1));
    expect(latest).toBe(true);
  });
});
