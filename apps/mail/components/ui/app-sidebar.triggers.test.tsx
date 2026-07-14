import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useReducer, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// #44 supervisor ruling d2f3e884 (dégel 0e55cc09) — OPTION A STRUCTURELLE, sans @testing-library/user-event.
// La dep directe user-event a été revertée : pnpm-lock.yaml est MUST-NOT-TOUCH de la fence #44, et le ruling
// d2f3e884 rendait l'option (A) structurelle POUR CETTE RAISON. Preuve real-trigger avec les composants de
// production exportés par app-sidebar (ComposeButton, PricingTrialButton) et les vraies surfaces lazy
// (ComposeSurface montée dans le DialogContent, PricingDialogSurface). Un clic SOURIS RÉEL (MouseEvent 'click'
// natif dispatché sur le <button>) fait passer useQueryState → 'true' → la surface monte → la factory d'import
// lazy est INVOQUÉE (compteur hoisted : 0 à froid, puis >0) → le fallback accessible rend pendant la
// suspension → le composant final rend après resolve. Assertion structurelle : chaque trigger est un <button>
// natif — donc activable Enter/Space par un VRAI navigateur. L'activation clavier NATIVE (Enter/Space →
// click synthétisé) N'EST PAS observable sous happy-dom : la sonde CLICKS_AFTER_ENTER le prouve (0 clic
// synthétisé). Elle est donc ROUTÉE #40 (rendu navigateur authentifié), cohérent avec la section
// « DETTES ROUTÉES #40 » du rapport (env local ne peut la produire ; aucun contournement).
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  composeFactory: 0,
  holdCompose: false,
  composePromise: null as null | Promise<void>,
  resolveCompose: null as null | (() => void),
  pricingFactory: 0,
  holdPricing: false,
  pricingPromise: null as null | Promise<void>,
  resolvePricing: null as null | (() => void),
}));

// Shared query-state store so the real button's setter and the reading surface see the same value.
const queryStore: Record<string, string | null> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

vi.mock('nuqs', () => ({
  useQueryState: (key: string) => {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
      listeners.add(force);
      return () => {
        listeners.delete(force);
      };
    }, []);
    const setter = (v: unknown) => {
      queryStore[key] = typeof v === 'function' ? (v as (o: unknown) => string | null)(queryStore[key] ?? null) : (v as string | null);
      notify();
    };
    return [queryStore[key] ?? null, setter];
  },
}));

vi.mock('../create/create-email', () => {
  h.composeFactory++;
  return {
    CreateEmail: () => {
      if (h.holdCompose) throw h.composePromise;
      return <div data-testid="compose" />;
    },
  };
});

vi.mock('../ui/pricing-dialog', () => {
  h.pricingFactory++;
  return {
    PricingDialog: () => {
      if (h.holdPricing) throw h.pricingPromise;
      return <div data-testid="pricing" />;
    },
  };
});

// ComposeButton's light hooks (it also uses useQueryState, mocked above).
vi.mock('@/components/ui/sidebar', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useSidebar: () => ({ state: 'expanded' }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

import { ComposeButton, PricingTrialButton } from './app-sidebar';
import { useQueryState } from 'nuqs';
import { PricingDialogSurface } from '../mail/mail-lazy-surfaces';

// A real, bubbling mouse click — the exact native event a pointer activation produces. No user-event.
function realClick(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

// Minimal wiring identical to mail.tsx: read the pricing query, pass it to the real surface.
function PricingWiring() {
  const [pd] = useQueryState('pricingDialog');
  return (
    <>
      <PricingTrialButton />
      <PricingDialogSurface open={!!pd} />
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

beforeEach(() => {
  for (const k of Object.keys(queryStore)) delete queryStore[k];
  h.composeFactory = 0;
  h.holdCompose = false;
  h.composePromise = new Promise<void>((r) => (h.resolveCompose = r));
  h.pricingFactory = 0;
  h.holdPricing = false;
  h.pricingPromise = new Promise<void>((r) => (h.resolvePricing = r));
});

afterEach(async () => {
  await act(async () => {
    h.holdCompose = false;
    h.holdPricing = false;
    h.resolveCompose?.();
    h.resolvePricing?.();
  });
  await act(async () => root.unmount());
  container.remove();
});

describe('Compose (real ComposeButton, real mouse click)', () => {
  it('native <button>; cold click → factory 0→>0, query true, accessible fallback, then composer', async () => {
    h.holdCompose = true;
    mount(<ComposeButton />);
    const btn = container.querySelector('button')!;
    // STRUCTURAL: the trigger is a real native <button> (Enter/Space-activatable in a real browser).
    expect(btn.tagName).toBe('BUTTON');
    // COLD: the compose chunk import has NOT been invoked (the dialog is closed, ComposeSurface
    // unmounted, so React.lazy never triggered import('./create-email')).
    expect(h.composeFactory).toBe(0);
    expect(queryStore['isComposeOpen']).toBeUndefined();

    await act(async () => {
      realClick(btn);
    });
    expect(queryStore['isComposeOpen']).toBe('true'); // real query flipped by the real click
    expect(h.composeFactory).toBeGreaterThan(0); // the click invoked the lazy import
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading composer');
    expect(document.querySelector('[data-testid="compose"]')).toBeNull();

    await act(async () => {
      h.holdCompose = false;
      h.resolveCompose?.();
    });
    expect(document.querySelector('[data-testid="compose"]')).not.toBeNull();
  });
});

describe('Pricing (real PricingTrialButton + PricingDialogSurface, real mouse click)', () => {
  it('native <button>; cold click → query true, factory invoked, fallback, then dialog', async () => {
    h.holdPricing = true;
    mount(<PricingWiring />);
    const btn = container.querySelector('button')!;
    // STRUCTURAL: the trigger is a real native <button> (Enter/Space-activatable in a real browser).
    expect(btn.tagName).toBe('BUTTON');
    // COLD: pricing chunk import NOT invoked (surface renders null while the query is falsy).
    expect(h.pricingFactory).toBe(0);
    expect(queryStore['pricingDialog']).toBeUndefined();

    await act(async () => {
      realClick(btn);
    });
    expect(queryStore['pricingDialog']).toBe('true');
    expect(h.pricingFactory).toBeGreaterThan(0); // import invoked by the click
    expect(document.querySelector('[role="dialog"][aria-label="Loading pricing"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="pricing"]')).toBeNull();

    await act(async () => {
      h.holdPricing = false;
      h.resolvePricing?.();
    });
    expect(document.querySelector('[data-testid="pricing"]')).not.toBeNull();
  });
});

describe('native keyboard activation — routed to #40', () => {
  // DEVIATION (routed to #40): both production triggers above are asserted to be real native <button>
  // elements, which a real browser activates on Enter/Space (firing a click that flips the query). happy-dom
  // does NOT synthesize that activation click from a native key event — this probe records the environmental
  // gap (CLICKS_AFTER_ENTER stays 0), which is why the native Enter/Space keyboard path is NOT asserted here
  // but ROUTED to #40 (authenticated browser render), alongside the cold-inbox network trace the local env
  // cannot produce. The click path (identical activation outcome) IS asserted above via realClick.
  it('happy-dom probe: native Enter/Space fire no synthesized click (CLICKS_AFTER_ENTER=0)', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    let CLICKS_AFTER_ENTER = 0;
    btn.addEventListener('click', () => {
      CLICKS_AFTER_ENTER++;
    });
    btn.focus();
    for (const key of ['Enter', ' ']) {
      btn.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      btn.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    }
    expect(CLICKS_AFTER_ENTER).toBe(0); // happy-dom synthesizes no activation click → native keyboard routed to #40
    btn.remove();
  });
});
