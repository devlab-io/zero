import {
  computeDraftDigest,
  detectInboundMemberReplies,
  normalizeDraftSnapshot,
} from './team-drafts-shared';
import { describe, expect, it } from 'vitest';

describe('normalizeDraftSnapshot', () => {
  it('strips html, collapses whitespace and normalizes recipients (sorted, deduped, lowercase)', () => {
    const snapshot = normalizeDraftSnapshot({
      subject: '  Re: Devis  ',
      content: '<p>Bonjour <b>monde</b></p>\n\n  suite',
      to: ['B@X.com', 'a@x.com', 'b@x.com '],
      cc: null,
      bcc: undefined,
    });
    expect(snapshot).toEqual({
      subject: 'Re: Devis',
      bodyText: 'Bonjour monde suite',
      to: ['a@x.com', 'b@x.com'],
      cc: [],
      bcc: [],
    });
  });
});

describe('computeDraftDigest', () => {
  it('is deterministic and sensitive to body AND recipients', async () => {
    const base = normalizeDraftSnapshot({ subject: 's', content: 'corps', to: ['a@x.com'] });
    const same = await computeDraftDigest(base);
    expect(await computeDraftDigest(base)).toBe(same);
    expect(same).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await computeDraftDigest(
        normalizeDraftSnapshot({ subject: 's', content: 'corps 2', to: ['a@x.com'] }),
      ),
    ).not.toBe(same);
    expect(
      await computeDraftDigest(
        normalizeDraftSnapshot({ subject: 's', content: 'corps', to: ['b@x.com'] }),
      ),
    ).not.toBe(same);
  });
});

describe('detectInboundMemberReplies', () => {
  const members = new Set(['omar@devlab.io', 'shane@devlab.io']);
  const mine = new Set(['thomas@devlab.io']);
  const BASE = 1_000_000;

  it('flags only MEMBER senders received AFTER the baseline, excluding myself', () => {
    const replies = detectInboundMemberReplies(
      [
        { senderEmail: 'Omar@Devlab.io', receivedOnMs: BASE + 10 }, // ✓ membre après
        { senderEmail: 'omar@devlab.io', receivedOnMs: BASE - 10 }, // avant baseline
        { senderEmail: 'client@ext.pf', receivedOnMs: BASE + 20 }, // non-membre
        { senderEmail: 'thomas@devlab.io', receivedOnMs: BASE + 30 }, // moi
        { senderEmail: 'shane@devlab.io', receivedOnMs: null }, // date inconnue
      ],
      members,
      mine,
      BASE,
    );
    expect(replies).toEqual([{ senderEmail: 'omar@devlab.io', receivedOnMs: BASE + 10 }]);
  });

  it('returns empty when nothing matches', () => {
    expect(detectInboundMemberReplies([], members, mine, BASE)).toEqual([]);
  });
});
