import {
  buildQuotedReplyHtml,
  normalizeQuotedSelection,
  resolveQuoteSelectionToolbar,
  syncInternalCommentQuote,
  insertQuotedReply,
} from './thread-quote';
import { describe, expect, it } from 'vitest';

describe('normalizeQuotedSelection', () => {
  it('keeps paragraphs while removing selection whitespace noise', () => {
    expect(normalizeQuotedSelection('  Premier point  \n\n\n  Deuxième point\u00a0 ')).toBe(
      'Premier point\n\nDeuxième point',
    );
  });
});

describe('resolveQuoteSelectionToolbar', () => {
  it('positions a toolbar for a real selection inside the message shadow root', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Texte du contact';
    root.appendChild(paragraph);

    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.getBoundingClientRect = () =>
      ({ left: 100, top: 80, right: 300, bottom: 100, width: 200, height: 20 }) as DOMRect;
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      toString: () => 'Texte du contact',
    } as unknown as Selection;

    expect(resolveQuoteSelectionToolbar({ root, selection, viewportWidth: 1_000 })).toEqual({
      text: 'Texte du contact',
      left: 200,
      top: 36,
    });
  });
});

describe('syncInternalCommentQuote', () => {
  it('clears a consumed selected-text quote in every mounted team section', () => {
    expect(
      syncInternalCommentQuote({ id: 'selection-1', messageId: 'm1', text: 'Excerpt' }, null),
    ).toBeNull();
  });

  it('preserves a local quote-latest choice when no external request exists', () => {
    const local = { id: '', messageId: 'm2', text: '' };
    expect(syncInternalCommentQuote(local, null)).toBe(local);
  });
});

describe('insertQuotedReply', () => {
  it('inserts the quote at the editor selection and runs one transaction', () => {
    let inserted = '';
    let runCount = 0;
    const chain = {
      focus: () => chain,
      insertContent: (content: string) => {
        inserted = content;
        return chain;
      },
      run: () => {
        runCount += 1;
        return true;
      },
    };

    expect(
      insertQuotedReply(
        { chain: () => chain },
        { messageId: 'm1', text: 'Point client', authorName: 'Alan', authorEmail: 'a@d.io' },
      ),
    ).toBe(true);
    expect(inserted).toContain('<blockquote>');
    expect(inserted).toContain('<strong>Alan</strong> wrote:');
    expect(runCount).toBe(1);
  });
});

describe('buildQuotedReplyHtml', () => {
  it('builds an attributed, escaped blockquote followed by an editable paragraph', () => {
    expect(
      buildQuotedReplyHtml({
        messageId: 'm1',
        authorName: 'Alan <Devlab>',
        authorEmail: 'alan@devlab.io',
        text: 'Le CA est > 90 %.\n\nÀ revoir & confirmer.',
      }),
    ).toBe(
      '<blockquote><p><strong>Alan &lt;Devlab&gt;</strong> wrote:</p><p>Le CA est &gt; 90 %.</p><p>À revoir &amp; confirmer.</p></blockquote><p></p>',
    );
  });
});
