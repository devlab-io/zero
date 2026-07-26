import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// P4 — une panne du fournisseur de facturation ne doit plus déconnecter la boîte mail.
//
// `useBilling` portait `useEffect(() => { if (error) signOut(); }, [error])`, et il est
// monté par `app-sidebar`, donc sur CHAQUE page authentifiée. N'importe quelle erreur
// d'Autumn — un tiers, hors du chemin critique du courrier — éjectait l'utilisateur.
// Ce test rend le VRAI hook avec un `useCustomer()` en erreur et exige : aucun signOut,
// et une dégradation propre sur DEFAULT_FEATURES.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signOut = vi.fn();
const customerState: { customer: unknown; error: unknown; isLoading: boolean } = {
  customer: null,
  error: null,
  isLoading: false,
};

vi.mock('@/lib/auth-client', () => ({ signOut }));
vi.mock('@/lib/utils', () => ({ isProCustomer: () => false }));
vi.mock('autumn-js/react', () => ({
  useCustomer: () => ({ ...customerState, refetch: vi.fn() }),
  useAutumn: () => ({ attach: vi.fn(), track: vi.fn(), openBillingPortal: vi.fn() }),
}));

const { useBilling } = await import('./use-billing');

type Billing = ReturnType<typeof useBilling>;
let captured: Billing | null = null;

function Probe() {
  captured = useBilling();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  signOut.mockClear();
  captured = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  customerState.customer = null;
  customerState.error = null;
});

describe('useBilling — une panne Autumn ne déconnecte plus (P4)', () => {
  it('une erreur du fournisseur ne déclenche AUCUN signOut', () => {
    customerState.error = new Error('autumn 503');
    act(() => root.render(<Probe />));

    expect(signOut).not.toHaveBeenCalled();
  });

  it('dégrade sur les quotas par défaut au lieu de couper la session', () => {
    customerState.error = new Error('autumn 503');
    act(() => root.render(<Probe />));

    expect(captured?.isPro).toBe(false);
    expect(captured?.chatMessages.enabled).toBe(false);
    expect(captured?.chatMessages.remaining).toBe(0);
    expect(captured?.connections.enabled).toBe(false);
    expect(captured?.brainActivity.enabled).toBe(false);
  });

  it('relaie l’erreur aux appelants qui voudraient la signaler', () => {
    const error = new Error('autumn 503');
    customerState.error = error;
    act(() => root.render(<Probe />));

    expect(captured?.error).toBe(error);
  });

  it('un rerender sur une erreur persistante ne déconnecte toujours pas', () => {
    customerState.error = new Error('autumn 503');
    act(() => root.render(<Probe />));
    act(() => root.render(<Probe />));
    customerState.error = new Error('autumn 500');
    act(() => root.render(<Probe />));

    expect(signOut).not.toHaveBeenCalled();
  });

  it('sans erreur, expose les quotas réels du client', () => {
    customerState.customer = {
      features: {
        'chat-messages': { included_usage: 50, balance: 12, usage: 38, interval: 'month' },
      },
    };
    act(() => root.render(<Probe />));

    expect(captured?.chatMessages.total).toBe(50);
    expect(captured?.chatMessages.remaining).toBe(12);
    expect(captured?.chatMessages.enabled).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });
});
