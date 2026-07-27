import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// pitbull (UI axis, P0) — the global ErrorBoundary in root.tsx used to compute a readable
// message and then never render it: the JSX always dumped `JSON.stringify(error, null, 2)`,
// which is "{}" for any plain thrown Error (message/stack are non-enumerable own properties).
// It's also the ROOT route's boundary, so an error thrown on (auth)/login (e.g. its
// clientLoader's providers fetch failing) bubbled up here and replaced the entire route tree
// with a dead end: no readable message, no way out. This test proves, against the real
// component: (1) no raw "{}" dump ever appears, (2) a readable message is present, and (3) a
// real exit action is rendered and actually navigates away from the crashed route.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Root-only providers (Autumn/PostHog/theme/query) are irrelevant to the boundary itself and
// pull in browser/network-coupled deps at import time — stub them as passthroughs, same pattern
// used by mail-lazy-surfaces.test.tsx / command-palette-context.test.tsx for heavy siblings.
vi.mock('@/providers/server-providers', () => ({
  ServerProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/providers/client-providers', () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}));

// There is no <Router> in this test (rendering the boundary component directly, not through a
// route tree), so useNavigate() would throw outside a Router context. Stub it while keeping the
// real isRouteErrorResponse — it's a plain duck-typed check (status: number, statusText: string,
// internal: boolean, 'data' in error), no Router context required.
const h = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => h.navigate };
});

import { ErrorBoundary } from './root';

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function buttonTexts() {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
}

describe('root ErrorBoundary — no dead-end "{}" dump (pitbull P0)', () => {
  it('application error: never dumps the raw object, shows a readable message and exit actions', () => {
    mount(<ErrorBoundary params={{}} error={new Error('boom: network down') as never} />);
    const text = container.textContent ?? '';

    // the exact failure the audit reported: a bare serialized empty object
    expect(text).not.toContain('{}');
    // a genuinely readable message is present
    expect(text).toContain('Something went wrong!');
    expect(text).toContain('An unexpected error occurred');
    // at least one real exit action is rendered
    const buttons = buttonTexts();
    expect(buttons.some((b) => b.includes('Retry'))).toBe(true);
    expect(buttons.some((b) => b.includes('Return to home'))).toBe(true);
    expect(buttons.some((b) => b.includes('Log out and try again'))).toBe(true);
  });

  it('route error (500): status-aware heading, still no raw dump, exit action present', () => {
    const routeError = {
      status: 500,
      statusText: 'Internal Server Error',
      internal: false,
      data: null,
    };
    mount(<ErrorBoundary params={{}} error={routeError as never} />);
    const text = container.textContent ?? '';

    expect(text).not.toContain('{}');
    expect(text).toContain('500');
    expect(text).toContain('Internal Server Error');
    expect(buttonTexts().some((b) => b.includes('Return to home'))).toBe(true);
  });

  it('the Home action navigates away from the crashed route instead of looping through it again', () => {
    mount(<ErrorBoundary params={{}} error={new Error('boom') as never} />);
    const homeButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Return to home'),
    );
    expect(homeButton).toBeTruthy();

    act(() => {
      homeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(h.navigate).toHaveBeenCalledWith('/');
  });

  it('technical detail is present but collapsed behind a <details> disclosure, not dumped inline', () => {
    mount(<ErrorBoundary params={{}} error={new Error('boom: network down') as never} />);
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('boom: network down');
  });
});
