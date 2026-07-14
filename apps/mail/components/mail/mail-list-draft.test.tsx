import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-drafts', () => ({ useDraft: () => ({ data: undefined }) }));
vi.mock('@/hooks/use-optimistic-actions', () => ({
  useOptimisticActions: () => ({ optimisticDeleteDraft: vi.fn() }),
}));
vi.mock('@/components/mail/optimistic-thread-state', () => ({
  useOptimisticThreadState: () => ({ shouldHide: false, isRemoving: false }),
}));
vi.mock('nuqs', () => ({ useQueryState: () => [null, vi.fn()] }));

import { Draft } from './mail-list-draft';

describe('draft row keyboard focus', () => {
  it('keeps the focus ring visible while the individual draft is loading', () => {
    const html = renderToStaticMarkup(
      <Draft message={{ id: 'draft-loading' }} index={0} isKeyboardFocused />,
    );

    expect(html).toContain('data-thread-id="draft-loading"');
    expect(html).toContain('ring-2');
  });
});
