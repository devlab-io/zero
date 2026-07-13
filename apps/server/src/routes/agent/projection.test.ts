import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { buildThreadProjection } from './projection';

/**
 * #30 — unit proof of the rich list projection with fake DO data.
 * Exercises the pure reshape `buildThreadProjection` (no SQLite / DO required):
 *  - fields map from the `threads` row + batched `thread_labels`;
 *  - the item carries NO body / base64 / processedHtml;
 *  - 50 rows serialize to a payload well under the 120 KiB (gzip) budget;
 *  - the pagination cursor follows the last row's `latest_received_on`.
 */

type Row = {
  id: string;
  latest_received_on: string | null;
  latest_subject: string | null;
  latest_sender: { name?: string; email: string } | null;
};

function fakeRow(i: number): Row {
  return {
    id: `thread-${i}`,
    latest_received_on: `2026-07-1${i % 10}T08:${String(i % 60).padStart(2, '0')}:00.000Z`,
    latest_subject: `Re: Proposition commerciale Devlab — dossier client #${1000 + i} suivi hebdo`,
    latest_sender: { name: `Prénom Nom ${i}`, email: `contact${i}@exemple-client-${i}.pf` },
  };
}

function fakeLabels(i: number): Map<string, { id: string; name: string }[]> {
  const map = new Map<string, { id: string; name: string }[]>();
  for (let n = 0; n < i; n++) {
    const labels = [
      { id: 'INBOX', name: 'Inbox' },
      { id: 'CATEGORY_PERSONAL', name: 'Personal' },
    ];
    // Every other thread is unread, and a few are starred.
    if (n % 2 === 0) labels.push({ id: 'UNREAD', name: 'Unread' });
    if (n % 5 === 0) labels.push({ id: 'STARRED', name: 'Starred' });
    map.set(`thread-${n}`, labels);
  }
  return map;
}

describe('buildThreadProjection (#30 rich list projection)', () => {
  it('maps subject / sender / date / labels / unread from the DO row', () => {
    const rows = [fakeRow(0)];
    const labels = new Map([
      ['thread-0', [{ id: 'INBOX', name: 'Inbox' }, { id: 'UNREAD', name: 'Unread' }]],
    ]);

    const { threads } = buildThreadProjection(rows, labels, 50);
    expect(threads).toHaveLength(1);
    const item = threads[0];

    expect(item.id).toBe('thread-0');
    expect(item.historyId).toBeNull();
    expect(item.subject).toBe(rows[0].latest_subject);
    expect(item.sender).toEqual(rows[0].latest_sender);
    expect(item.receivedOn).toBe(rows[0].latest_received_on);
    expect(item.labels).toEqual([
      { id: 'INBOX', name: 'Inbox' },
      { id: 'UNREAD', name: 'Unread' },
    ]);
    expect(item.unread).toBe(true);
  });

  it('derives unread === false when the UNREAD label is absent', () => {
    const rows = [fakeRow(1)];
    const labels = new Map([['thread-1', [{ id: 'INBOX', name: 'Inbox' }]]]);
    const { threads } = buildThreadProjection(rows, labels, 50);
    expect(threads[0].unread).toBe(false);
  });

  it('carries NO body / base64 / processedHtml (no per-row payload weight)', () => {
    const rows = Array.from({ length: 50 }, (_, i) => fakeRow(i));
    const { threads } = buildThreadProjection(rows, fakeLabels(50), 50);
    const json = JSON.stringify(threads);
    expect(json).not.toContain('"body"');
    expect(json).not.toContain('"decodedBody"');
    expect(json).not.toContain('"processedHtml"');
    expect(json).not.toContain('"blobUrl"');
    expect(json).not.toContain('base64');
    // Each item exposes exactly the projection surface — nothing else.
    for (const item of threads) {
      expect(Object.keys(item).sort()).toEqual(
        ['historyId', 'id', 'labels', 'receivedOn', 'sender', 'subject', 'unread'].sort(),
      );
    }
  });

  it('serializes 50 rows well under the 120 KiB gzip budget', () => {
    const rows = Array.from({ length: 50 }, (_, i) => fakeRow(i));
    const response = buildThreadProjection(rows, fakeLabels(50), 50);
    const raw = Buffer.from(JSON.stringify(response), 'utf8');
    const gzipped = gzipSync(raw);
    // Report the measured sizes so the proof is reproducible from the test log.
    console.log(
      `[#30] 50-row projection payload: raw=${raw.length}B gzip=${gzipped.length}B (budget 122880B)`,
    );
    expect(gzipped.length).toBeLessThanOrEqual(120 * 1024);
  });

  it('emits a next-page cursor from the last row when the page is full', () => {
    const rows = Array.from({ length: 50 }, (_, i) => fakeRow(i));
    const { nextPageToken } = buildThreadProjection(rows, fakeLabels(50), 50);
    expect(nextPageToken).toBe(rows[rows.length - 1].latest_received_on);
  });

  it('emits null cursor for a short (last) page and empty for no rows', () => {
    const short = buildThreadProjection([fakeRow(0), fakeRow(1)], fakeLabels(2), 50);
    expect(short.nextPageToken).toBeNull();

    const empty = buildThreadProjection([], new Map(), 50);
    expect(empty.threads).toEqual([]);
    expect(empty.nextPageToken).toBe('');
  });
});
