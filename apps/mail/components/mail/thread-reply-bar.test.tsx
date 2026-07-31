import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { ThreadReplyBar } from './thread-reply-bar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = {
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
};

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

function renderBar(onSelect = () => {}) {
  act(() => root.render(<ThreadReplyBar labels={labels} onSelect={onSelect} />));
}

function button(label: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

describe('ThreadReplyBar', () => {
  it('keeps the three reply actions in an always-visible footer', () => {
    renderBar();

    expect(container.querySelector('[data-testid="thread-reply-bar"]')).not.toBeNull();
    expect(
      container
        .querySelector('[data-testid="thread-reply-bar"]')
        ?.getAttribute('data-always-visible'),
    ).toBe('true');
    expect(button('Reply all').tagName).toBe('BUTTON');
    expect(button('Reply').tagName).toBe('BUTTON');
    expect(button('Forward').tagName).toBe('BUTTON');
  });

  it.each([
    ['Reply all', 'replyAll'],
    ['Reply', 'reply'],
    ['Forward', 'forward'],
  ] as const)('opens %s on the latest message', (label, mode) => {
    const onSelect = vi.fn();
    renderBar(onSelect);

    act(() => button(label).dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(mode);
  });
});
