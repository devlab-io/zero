import {
  THREAD_DETAIL_RECONCILE_MS,
  THREAD_DETAIL_STALE_MS,
  threadDetailQueryBehavior,
  threadDetailStaleTime,
} from './thread-detail-query';
import { describe, expect, it } from 'vitest';

describe('threadDetailQueryBehavior', () => {
  it('reconciles an open thread on focus and every minute', () => {
    expect(threadDetailQueryBehavior(true)).toMatchObject({
      refetchOnMount: true,
      refetchOnWindowFocus: 'always',
      refetchInterval: THREAD_DETAIL_RECONCILE_MS,
      refetchIntervalInBackground: false,
    });
  });

  it('keeps complete bodies briefly fresh but repairs incomplete cache entries immediately', () => {
    expect(threadDetailStaleTime({ messages: [] })).toBe(0);
    expect(
      threadDetailStaleTime({
        messages: [{ id: 'm1', decodedBody: '<p>Latest Shortwave reply</p>' }],
      }),
    ).toBe(THREAD_DETAIL_STALE_MS);
  });

  it('does not poll disabled readers', () => {
    expect(threadDetailQueryBehavior(false)).toMatchObject({
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchInterval: false,
    });
  });
});
