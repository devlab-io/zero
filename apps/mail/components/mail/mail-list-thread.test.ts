import {
  buildThreadRowAccessibleName,
  threadRowPropsAreEqual,
  type ThreadRowProps,
} from './mail-list-thread-projection';
import { describe, it, expect } from 'vitest';

/**
 * #30 — the row renders from the projection carried on `message`, so React.memo must
 * re-render whenever ANY rendered projection field changes. These reproduce the two
 * regressions of a length-only / email-only comparator: they are RED against that comparator
 * and GREEN against the content-aware one.
 */

const onClick = () => () => {};

function props(message: Partial<ThreadRowProps['message']> = {}): ThreadRowProps {
  return {
    message: {
      id: 't1',
      historyId: null,
      subject: 'Suivi dossier client',
      receivedOn: '2026-07-13T08:00:00.000Z',
      unread: true,
      sender: { name: 'Alice Martin', email: 'alice@client.pf' },
      labels: [
        { id: 'STARRED', name: 'Starred' },
        { id: 'INBOX', name: 'Inbox' },
      ],
      ...message,
    },
    onClick,
    isKeyboardFocused: false,
    index: 0,
  };
}

describe('threadRowPropsAreEqual (#30 memo comparator)', () => {
  it('is TRUE for identical props (memo keeps skipping needless re-renders)', () => {
    expect(threadRowPropsAreEqual(props(), props())).toBe(true);
  });

  it('BLOCKER-A: label swap of EQUAL length (STARRED→IMPORTANT) forces a re-render', () => {
    const prev = props();
    const next = props({
      labels: [
        { id: 'IMPORTANT', name: 'Important' },
        { id: 'INBOX', name: 'Inbox' },
      ],
    });
    expect(threadRowPropsAreEqual(prev, next)).toBe(false);
  });

  it('BLOCKER-B: sender NAME change at an UNCHANGED email forces a re-render', () => {
    const prev = props();
    const next = props({ sender: { name: 'Alicia Martin', email: 'alice@client.pf' } });
    expect(threadRowPropsAreEqual(prev, next)).toBe(false);
  });

  it('detects subject / date / unread / email / label-order changes', () => {
    expect(threadRowPropsAreEqual(props(), props({ subject: 'Autre sujet' }))).toBe(false);
    expect(threadRowPropsAreEqual(props(), props({ receivedOn: '2026-07-14T00:00:00.000Z' }))).toBe(
      false,
    );
    expect(threadRowPropsAreEqual(props(), props({ unread: false }))).toBe(false);
    expect(
      threadRowPropsAreEqual(props(), props({ sender: { name: 'Alice Martin', email: 'b@c.pf' } })),
    ).toBe(false);
    expect(
      threadRowPropsAreEqual(
        props(),
        props({
          labels: [
            { id: 'INBOX', name: 'Inbox' },
            { id: 'STARRED', name: 'Starred' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('re-renders on index / keyboard-focus change', () => {
    const prev = props();
    expect(threadRowPropsAreEqual(prev, { ...prev, index: 1 })).toBe(false);
    expect(threadRowPropsAreEqual(prev, { ...prev, isKeyboardFocused: true })).toBe(false);
  });
});

describe('inbox row accessible name', () => {
  it('announces read state, sender, subject and received time', () => {
    expect(buildThreadRowAccessibleName(props().message)).toBe(
      'Unread: Alice Martin, Suivi dossier client, 2026-07-13T08:00:00.000Z',
    );
    expect(
      buildThreadRowAccessibleName(
        props({ sender: { name: '', email: 'alice@client.pf' }, subject: '', unread: false })
          .message,
      ),
    ).toContain('Read: alice@client.pf, No subject');
  });
});
