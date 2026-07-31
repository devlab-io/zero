import { DeferredThreadContextMenu } from './thread-context.deferred';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// r13 : tant que le chunk du menu n'est pas chargé, la ligne rend ses children
// TELS QUELS — zéro différence visuelle, zéro dépendance au chunk lourd.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DeferredThreadContextMenu', () => {
  it('rend les children en pass-through AVANT le chargement du chunk menu', () => {
    act(() =>
      root.render(
        <DeferredThreadContextMenu
          threadId="t1"
          isInbox={true}
          isSpam={false}
          isSent={false}
          isBin={false}
        >
          <div data-testid="row-content">ROW-CONTENT</div>
        </DeferredThreadContextMenu>,
      ),
    );
    expect(container.textContent).toContain('ROW-CONTENT');
  });
});
