import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { BootPerfPanel } from './boot-perf-panel';
import { act } from 'react';

// r12 : le panneau diagnostic n'existe QU'AVEC ?bootperf=1, expose les jalons
// zero:* en texte lisible par l'arbre AX (role=status), et ne porte aucune
// donnée mail ni identifiant — uniquement des noms de jalons et des ms.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, '', '/');
});

const render = () => act(() => root.render(<BootPerfPanel />));

describe('BootPerfPanel', () => {
  it('SANS ?bootperf=1 : absent du DOM (prod-safe)', () => {
    window.history.replaceState(null, '', '/mail/inbox');
    render();
    expect(container.innerHTML).toBe('');
  });

  it('avec ?bootperf=1 : role=status présent, jalons zero:* listés avec leur startTime', () => {
    window.history.replaceState(null, '', '/mail/inbox?bootperf=1');
    performance.mark('zero:boot:session-confirmed');
    render();

    const panel = container.querySelector('[role="status"]');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-label')).toBe('bootperf');
    expect(panel!.textContent).toContain('boot:session-confirmed @');
    expect(panel!.textContent).toContain('longtasks n=');
  });

  it('n’expose que des jalons et des millisecondes — jamais de contenu mail', () => {
    window.history.replaceState(null, '', '/mail/inbox?bootperf=1');
    performance.mark('zero:boot:route-mounted');
    render();
    const rows = [...container.querySelectorAll('[role="status"] > div')].map(
      (row) => row.textContent ?? '',
    );
    // Chaque ligne : soit l'en-tête, soit `jalon @Nms` / `mesure =Nms`, soit
    // l'agrégat longtasks — jamais autre chose (aucun contenu mail possible).
    for (const line of rows) {
      expect(line).toMatch(
        /^bootperf \(ms depuis navigationStart\)$|^[a-z:>-]+ [@=]-?\d+ms$|^longtasks n=\d+ total=\d+ms max=\d+ms$/i,
      );
    }
    expect(rows.some((line) => line.startsWith('boot:route-mounted @'))).toBe(true);
  });

  it('un autre paramètre (bootperf=0) ne l’active pas', () => {
    window.history.replaceState(null, '', '/mail/inbox?bootperf=0');
    render();
    expect(container.innerHTML).toBe('');
  });
});
