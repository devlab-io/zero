import { SidebarProvider } from '@/components/context/sidebar-context';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeferredAppSidebar } from './app-sidebar.deferred';
import { createRoot, type Root } from 'react-dom/client';
import { SIDEBAR_WIDTH } from '@/lib/constants';
import { act } from 'react';

// r13 : tant que le signal boot:list-painted n'est pas émis, la sidebar réelle
// n'est PAS montée — seul le placeholder iso-largeur occupe le layout (zéro
// flash), et aucun chunk sidebar n'est demandé.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  performance.clearMarks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DeferredAppSidebar', () => {
  it('AVANT le signal list-painted : placeholder iso-largeur seul, pas de sidebar réelle', () => {
    act(() =>
      root.render(
        <SidebarProvider>
          <DeferredAppSidebar />
        </SidebarProvider>,
      ),
    );

    const placeholder = container.querySelector('[data-testid="app-sidebar-placeholder"]');
    expect(placeholder).not.toBeNull();
    // Largeur EXACTE du rail réel (état étendu par défaut) : zéro flash.
    expect((placeholder as HTMLElement).style.width).toBe(SIDEBAR_WIDTH);
    // La vraie sidebar (nav, compose) n'est pas montée.
    expect(container.querySelector('[data-sidebar]')).toBeNull();
  });
});
