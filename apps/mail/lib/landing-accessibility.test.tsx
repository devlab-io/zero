import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { act, type ReactNode } from 'react';

import { HomeCollabSection } from '@/components/home/sections/home-collab-section';
import { HomeReplyMockup } from '@/components/home/sections/home-reply-mockup';
import { HomeApiSection } from '@/components/home/sections/home-api-section';
import { Navigation } from '@/components/navigation';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const normalizeText = (value: string | null) => value?.replace(/\s+/g, ' ').trim() ?? '';

describe('P12/P121 rendered accessibility contract', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = '';
  });

  const render = async (node: ReactNode) => {
    await act(async () => root.render(node));
  };

  it('renders the mobile menu trigger with a name, state, relation and 44px target', async () => {
    await render(
      <MemoryRouter>
        <Navigation />
      </MemoryRouter>,
    );

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open navigation"]',
    );

    expect(trigger).not.toBeNull();
    expect(normalizeText(trigger?.textContent ?? null)).toBe('Open navigation');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.getAttribute('aria-controls')).toBeTruthy();
    expect(trigger?.classList.contains('size-11')).toBe(true);
    expect(trigger?.classList.contains('min-h-11')).toBe(true);
    expect(trigger?.classList.contains('min-w-11')).toBe(true);

    await act(async () => trigger?.click());

    expect(trigger?.getAttribute('aria-label')).toBe('Close navigation');
    expect(normalizeText(trigger?.textContent ?? null)).toBe('Close navigation');
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    const controlledId = trigger?.getAttribute('aria-controls');
    expect(controlledId).toBeTruthy();
    expect(document.getElementById(controlledId ?? '')).not.toBeNull();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();

    await act(async () => {
      const escapeTarget = document.activeElement ?? dialog ?? document;
      escapeTarget.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger?.getAttribute('aria-label')).toBe('Open navigation');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('renders one labelled h2 with visual-line spans for each narrative section', async () => {
    await render(
      <>
        <HomeCollabSection />
        <HomeReplyMockup />
        <HomeApiSection />
      </>,
    );

    const expected = [
      ['collaboration-heading', 'Share the thread', 'not another app'],
      ['keyboard-heading', 'Triage at typing speed', 'reply without leaving the keyboard'],
      ['automation-heading', 'Your inbox, your models', 'your rules'],
    ] as const;

    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(expected.length);

    for (const [id, firstLine, secondLine] of expected) {
      const heading = container.querySelector<HTMLHeadingElement>(`h2#${id}`);
      const section = heading?.closest('section');
      const lines = Array.from(heading?.children ?? []);

      expect(heading).not.toBeNull();
      expect(section?.getAttribute('aria-labelledby')).toBe(id);
      expect(lines.map((line) => line.tagName)).toEqual(['SPAN', 'SPAN']);
      expect(lines.map((line) => normalizeText(line.textContent))).toEqual([firstLine, secondLine]);
      expect(heading?.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    }
  });
});
