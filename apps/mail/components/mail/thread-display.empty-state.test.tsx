import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  setComposeOpen: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('nuqs', () => ({
  useQueryState: () => [null, h.setComposeOpen],
}));

vi.mock('../icons/empty-state-svg', () => ({
  EmptyStateIcon: () => <div data-testid="legacy-empty-icon" />,
}));

vi.mock('../icons/icons', () => ({
  Mail: () => null,
}));

vi.mock('./inbox-dashboard', () => ({
  InboxDashboard: ({ onCompose }: { onCompose: () => void }) => (
    <button data-testid="inbox-dashboard" onClick={onCompose}>
      Inbox dashboard
    </button>
  ),
}));

import { ThreadEmptyState } from './thread-display.empty-state';

let container: HTMLDivElement;
let root: Root;

function renderAt(folder: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/mail/${folder}`]}>
        <Routes>
          <Route path="/mail/:folder" element={<ThreadEmptyState />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  h.setComposeOpen.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ThreadEmptyState — branche réellement rendue sans fil sélectionné', () => {
  it('affiche le dashboard dans Inbox et n’affiche jamais l’ancien vide', () => {
    renderAt('inbox');

    expect(container.querySelector('[data-testid="inbox-dashboard"]')).not.toBeNull();
    expect(container.textContent).not.toContain("It's empty here");

    act(() => {
      (container.querySelector('[data-testid="inbox-dashboard"]') as HTMLButtonElement).click();
    });
    expect(h.setComposeOpen).toHaveBeenCalledWith('true');
  });

  it('conserve l’état vide explicite dans les dossiers non-Inbox', () => {
    renderAt('sent');

    expect(container.querySelector('[data-testid="inbox-dashboard"]')).toBeNull();
    expect(container.textContent).toContain("It's empty here");
    expect(container.textContent).toContain('Choose an email to view details');
  });
});
