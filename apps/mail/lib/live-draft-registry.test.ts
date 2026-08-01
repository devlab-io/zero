import {
  hasLiveComposer,
  readLiveDraft,
  registerLiveDraft,
  type LiveDraftPublishInput,
} from './live-draft-registry';
import { describe, expect, it } from 'vitest';

const snapshot = (overrides: LiveDraftPublishInput = {}): LiveDraftPublishInput => ({
  to: ['client@x.test'],
  cc: [],
  bcc: [],
  subject: 'Objet',
  bodyHtml: '<p>corps</p>',
  ...overrides,
});

describe('live-draft-registry — strict in-memory seam', () => {
  it('register/publish/read round-trips on the exact scope key only', () => {
    const handle = registerLiveDraft('zero:composer-draft:t=abc');
    handle.publish(snapshot());
    expect(hasLiveComposer('zero:composer-draft:t=abc')).toBe(true);
    expect(readLiveDraft('zero:composer-draft:t=abc')?.bodyHtml).toBe('<p>corps</p>');
    // Cross-scope isolation is structural.
    expect(hasLiveComposer('zero:composer-draft:t=OTHER')).toBe(false);
    expect(readLiveDraft('zero:composer-draft:compose')).toBeNull();
    handle.unregister();
    expect(hasLiveComposer('zero:composer-draft:t=abc')).toBe(false);
  });

  it('revision grows with each publish; the read reflects the LATEST content', () => {
    const handle = registerLiveDraft('key-rev');
    handle.publish(snapshot({ bodyHtml: '<p>alpha</p>' }));
    const first = readLiveDraft('key-rev')!;
    handle.publish(snapshot({ bodyHtml: '<p>alphabeta</p>' }));
    const second = readLiveDraft('key-rev')!;
    expect(second.bodyHtml).toBe('<p>alphabeta</p>');
    expect(second.revision).toBeGreaterThan(first.revision);
    handle.unregister();
  });

  it('bounds a falsified/oversize snapshot on write', () => {
    const handle = registerLiveDraft('key-bounds');
    handle.publish({
      to: Array.from({ length: 100 }, (_, i) => `r${i}@${'x'.repeat(500)}.test`),
      cc: 'pas-un-tableau',
      subject: 's'.repeat(5_000),
      bodyHtml: 'b'.repeat(500_000),
    });
    const bounded = readLiveDraft('key-bounds')!;
    expect(bounded.to).toHaveLength(20);
    expect(bounded.to[0]).toHaveLength(200);
    expect(bounded.cc).toEqual([]);
    expect(bounded.subject).toHaveLength(500);
    expect(bounded.bodyHtml).toHaveLength(120_000);
    handle.unregister();
  });

  it('owner generations: a NEW instance supersedes; the old cleanup is non-destructive', () => {
    const old = registerLiveDraft('key-owner');
    old.publish(snapshot({ bodyHtml: '<p>ancien</p>' }));
    const fresh = registerLiveDraft('key-owner');
    fresh.publish(snapshot({ bodyHtml: '<p>nouveau</p>' }));

    // A late publish from the superseded instance is a no-op…
    old.publish(snapshot({ bodyHtml: '<p>fantôme</p>' }));
    expect(readLiveDraft('key-owner')?.bodyHtml).toBe('<p>nouveau</p>');
    // …and its unmount cleanup never removes the newer instance.
    old.unregister();
    expect(hasLiveComposer('key-owner')).toBe(true);
    expect(readLiveDraft('key-owner')?.bodyHtml).toBe('<p>nouveau</p>');
    fresh.unregister();
    expect(hasLiveComposer('key-owner')).toBe(false);
  });
});
