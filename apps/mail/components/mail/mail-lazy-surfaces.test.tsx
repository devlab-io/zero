import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// #44 — focused render proof for the interaction-gated surfaces (substitute for a full authenticated
// app run). happy-dom + react-dom/client + act, with the heavy panels mocked as SUSPENDABLE stubs so
// we can assert: the surface mounts nothing at rest, and once its state is truthy it shows the real,
// accessible fallback WHILE the chunk loads, then the final component — never the panel at rest.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  holdReader: false,
  readerPromise: null as null | Promise<void>,
  resolveReader: null as null | (() => void),
  readerMounts: 0,
  holdPricing: false,
  pricingPromise: null as null | Promise<void>,
  resolvePricing: null as null | (() => void),
  pricingMounts: 0,
}));

vi.mock('@/components/mail/thread-display', () => ({
  ThreadDisplay: () => {
    if (h.holdReader) throw h.readerPromise;
    h.readerMounts++;
    return <div data-testid="reader" />;
  },
}));

vi.mock('../ui/pricing-dialog', () => ({
  PricingDialog: () => {
    if (h.holdPricing) throw h.pricingPromise;
    h.pricingMounts++;
    return <div data-testid="pricing" />;
  },
}));

vi.mock('./thread-display.empty-state', () => ({
  ThreadEmptyState: () => <div data-testid="empty-state" />,
}));

import { PricingDialogSurface, ThreadReaderSurface } from './mail-lazy-surfaces';

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

beforeEach(() => {
  h.holdReader = false;
  h.readerPromise = new Promise<void>((r) => (h.resolveReader = r));
  h.readerMounts = 0;
  h.holdPricing = false;
  h.pricingPromise = new Promise<void>((r) => (h.resolvePricing = r));
  h.pricingMounts = 0;
});

afterEach(async () => {
  await act(async () => {
    h.holdReader = false;
    h.holdPricing = false;
    h.resolveReader?.();
    h.resolvePricing?.();
  });
  await act(async () => root.unmount());
  container.remove();
});

describe('PricingDialogSurface', () => {
  it('open=false → renders nothing (chunk not fetched)', () => {
    mount(<PricingDialogSurface open={false} />);
    expect(container.querySelector('[data-testid="pricing"]')).toBeNull();
    expect(container.querySelector('[aria-label="Loading pricing"]')).toBeNull();
    expect(h.pricingMounts).toBe(0);
  });

  it('open=true → accessible modal fallback PRESENT while loading, then the dialog', async () => {
    h.holdPricing = true;
    mount(<PricingDialogSurface open={true} />);
    await act(async () => {});
    // fallback present, real dialog not yet mounted
    expect(
      container.querySelector('[role="dialog"][aria-label="Loading pricing"]'),
    ).not.toBeNull();
    expect(h.pricingMounts).toBe(0);

    // resolve the chunk → final dialog rendered, fallback gone
    await act(async () => {
      h.holdPricing = false;
      h.resolvePricing?.();
    });
    expect(container.querySelector('[data-testid="pricing"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Loading pricing"]')).toBeNull();
  });
});

describe('ThreadReaderSurface', () => {
  it('no threadId + emptyOnNull → eager empty state, reader chunk not fetched', () => {
    mount(<ThreadReaderSurface threadId={null} emptyOnNull />);
    expect(container.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(h.readerMounts).toBe(0);
  });

  it('no threadId + emptyOnNull=false → renders nothing', () => {
    mount(<ThreadReaderSurface threadId={null} emptyOnNull={false} />);
    expect(container.querySelector('[data-testid="empty-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="reader"]')).toBeNull();
    expect(h.readerMounts).toBe(0);
  });

  it('threadId set → accessible loading fallback PRESENT while loading, then the reader', async () => {
    h.holdReader = true;
    mount(<ThreadReaderSurface threadId="t1" emptyOnNull />);
    await act(async () => {});
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Loading thread');
    expect(h.readerMounts).toBe(0);

    await act(async () => {
      h.holdReader = false;
      h.resolveReader?.();
    });
    expect(container.querySelector('[data-testid="reader"]')).not.toBeNull();
  });
});
