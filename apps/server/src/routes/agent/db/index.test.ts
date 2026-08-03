import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { modifyThreadLabels, type DB } from './index';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { DatabaseSync } from 'node:sqlite';
import * as schema from './schema';

describe('modifyThreadLabels', () => {
  let sqlite: DatabaseSync;
  let db: DB;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE threads (
        id TEXT PRIMARY KEY NOT NULL,
        thread_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        latest_sender TEXT,
        latest_received_on TEXT,
        latest_subject TEXT
      );
      CREATE TABLE labels (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      );
      CREATE TABLE thread_labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        UNIQUE(thread_id, label_id)
      );
    `);

    const proxy = drizzle(
      async (query, params, method) => {
        const statement = sqlite.prepare(query);

        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') {
          const row = statement.get(...params);
          return { rows: row ? Object.values(row) : undefined } as unknown as { rows: unknown[] };
        }
        return { rows: statement.all(...params).map((row) => Object.values(row)) };
      },
      { schema },
    );
    db = proxy as unknown as DB;
  });

  afterEach(() => sqlite.close());

  it('skips a label delta when the local thread is not synced', async () => {
    await expect(modifyThreadLabels(db, 'missing', ['INBOX'], [])).resolves.toEqual({
      threadFound: false,
      addedLabels: [],
      removedLabels: [],
    });

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM labels').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM thread_labels').get()).toEqual({
      count: 0,
    });
  });

  it('updates labels atomically when the thread exists', async () => {
    sqlite
      .prepare('INSERT INTO threads (id, thread_id, provider_id) VALUES (?, ?, ?)')
      .run('thread-1', 'thread-1', 'provider-1');
    sqlite
      .prepare('INSERT INTO labels (id, name, color) VALUES (?, ?, ?)')
      .run('OLD', 'OLD', '#000000');
    sqlite
      .prepare('INSERT INTO thread_labels (thread_id, label_id) VALUES (?, ?)')
      .run('thread-1', 'OLD');

    await expect(modifyThreadLabels(db, 'thread-1', ['INBOX'], ['OLD'])).resolves.toEqual({
      threadFound: true,
      addedLabels: ['INBOX'],
      removedLabels: ['OLD'],
    });

    expect(
      sqlite
        .prepare('SELECT label_id FROM thread_labels WHERE thread_id = ? ORDER BY label_id')
        .all('thread-1'),
    ).toEqual([{ label_id: 'INBOX' }]);
  });
});
