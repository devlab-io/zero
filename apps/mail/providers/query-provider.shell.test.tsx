import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Preuve composant du shell neutre P0 (r6) : pendant que la session résout,
// les children ne montent PAS (aucune query mailbox ne peut partir, rien ne
// peint) ; à la résolution, la même identité monte immédiatement le
// PersistQueryClientProvider chaud (restore du persister par compte).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: { data: null as null | { user: { id: string } }, isPending: true },
  idbGets: [] as string[],
  fetchCalls: 0,
}));

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: IDBValidKey) => {
    h.idbGets.push(String(key));
    return undefined;
  }),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  keys: vi.fn(async () => []),
}));

vi.mock('@/lib/auth-client', () => ({
  useSession: () => h.session,
  signOut: vi.fn(async () => {}),
}));

import { QueryProvider } from './query-provider';

let sentinelRenders = 0;
function MailboxSentinel() {
  sentinelRenders += 1;
  return <div>MAILBOX-SENTINEL</div>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sentinelRenders = 0;
  h.session = { data: null, isPending: true };
  h.idbGets.length = 0;
  h.fetchCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      h.fetchCalls += 1;
      return new Promise<Response>(() => {});
    }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const renderProvider = () => {
  act(() => {
    root.render(
      <QueryProvider>
        <MailboxSentinel />
      </QueryProvider>,
    );
  });
};

describe('QueryProvider — shell neutre pendant la résolution de session', () => {
  it('pending : le contenu mailbox ne rend PAS et aucune requête ne part ; résolution même identité : montage chaud immédiat', () => {
    renderProvider();

    // Pendant pending : shell neutre seul — les children ne sont pas montés,
    // donc aucune query listThreads (ni aucune autre) ne peut partir.
    expect(container.innerHTML).toContain('identity-pending-shell');
    expect(container.innerHTML).not.toContain('MAILBOX-SENTINEL');
    expect(sentinelRenders).toBe(0);
    expect(h.fetchCalls).toBe(0);
    // Aucun persister restauré pendant pending : la SEULE lecture IDB admise
    // est le warm du handle (clé constante '__zero-idb-warm', jamais écrite,
    // r9) — aucune clé user-scopée (zero-query-cache-*) n'est touchée.
    expect(h.idbGets.filter((key) => key !== '__zero-idb-warm')).toEqual([]);
    expect(h.idbGets.some((key) => key.includes('zero-query-cache'))).toBe(false);

    // La session résout sur une identité confirmée.
    h.session = { data: { user: { id: 'user-1' } }, isPending: false };
    renderProvider();

    // Les children montent immédiatement sous le PersistQueryClientProvider
    // du compte : le restore du persister user-scopé est déclenché (cache chaud).
    expect(container.innerHTML).not.toContain('identity-pending-shell');
    expect(container.innerHTML).toContain('MAILBOX-SENTINEL');
    expect(sentinelRenders).toBeGreaterThan(0);
    expect(h.idbGets.some((key) => key.includes('user-1'))).toBe(true);
  });
});
