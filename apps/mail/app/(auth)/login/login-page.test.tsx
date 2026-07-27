import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// pitbull (point 7, volet rendu) — deux garanties : (1) en mode dégradé le FORMULAIRE reste
// affiché, avec un avertissement et un moyen de réessayer ; (2) le segment `/login` possède
// désormais sa propre ErrorBoundary (convention React Router 7), donc une erreur résiduelle
// n'atteint plus l'ErrorBoundary racine qui remplaçait tout l'arbre sans retour possible.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Le vrai LoginClient tire better-auth / nuqs / les icônes ; on le remplace par un marqueur
// qui joue le rôle du formulaire (même patron de stub que root.test.tsx pour ses voisins).
vi.mock('./login-client', () => ({
  LoginClient: ({ providers }: { providers: unknown[] }) => (
    <form data-testid="login-form">providers:{providers.length}</form>
  ),
}));

const h = vi.hoisted(() => ({
  loaderData: {
    allProviders: [] as unknown[],
    providersUnavailable: false,
    isProd: true,
  },
  routeError: undefined as unknown,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useLoaderData: () => h.loaderData, useRouteError: () => h.routeError };
});

const { default: LoginPage, ErrorBoundary } = await import('./page');

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

describe('LoginPage — état dégradé', () => {
  it('affiche toujours le formulaire et un avertissement quand les providers sont indisponibles', () => {
    h.loaderData = { allProviders: [], providersUnavailable: true, isProd: true };
    mount(<LoginPage />);

    expect(container.querySelector('[data-testid="login-form"]')).not.toBeNull();
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Error');
    // un moyen de réessayer est offert, sans quitter /login
    expect(alert?.querySelector('button')).not.toBeNull();
  });

  it("n'affiche aucun avertissement quand le backend a répondu normalement", () => {
    h.loaderData = { allProviders: [{ id: 'google' }], providersUnavailable: false, isProd: true };
    mount(<LoginPage />);

    expect(container.querySelector('[data-testid="login-form"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('ErrorBoundary de route /login', () => {
  it("est bien exportée par le segment (sinon l'erreur remonte à la racine)", () => {
    expect(typeof ErrorBoundary).toBe('function');
  });

  it('rend un message lisible et un chemin de sortie pour une erreur applicative', () => {
    h.routeError = new Error('boom: providers indisponibles');
    mount(<ErrorBoundary />);

    const text = container.textContent ?? '';
    expect(text).toContain('Something went wrong!');
    expect(text).not.toContain('{}');
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
    expect(container.querySelector('button')).not.toBeNull();
    // le détail technique existe mais reste replié
    const details = container.querySelector('details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.textContent).toContain('boom: providers indisponibles');
  });

  it('rend le statut pour une réponse de route en erreur', () => {
    h.routeError = {
      status: 500,
      statusText: 'Internal Server Error',
      internal: false,
      data: null,
    };
    mount(<ErrorBoundary />);

    const text = container.textContent ?? '';
    expect(text).toContain('500');
    expect(text).toContain('Internal Server Error');
  });
});
