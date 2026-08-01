import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'team-store.ts'),
  'utf8',
);

describe('team comment audit contract', () => {
  it('audits create, edit, own delete and owner delete', () => {
    expect(source).toContain("action: 'comment.created'");
    expect(source).toContain("action: 'comment.edited'");
    expect(source).toContain("let action = 'comment.deleted'");
    expect(source).toContain("action = 'comment.deleted_by_owner'");
  });

  it('rechecks thread ACL before editing or deleting an existing comment', () => {
    const editBlock = source.slice(
      source.indexOf('export async function editComment'),
      source.indexOf('export async function deleteComment'),
    );
    const deleteBlock = source.slice(
      source.indexOf('export async function deleteComment'),
      source.indexOf('export async function listComments'),
    );
    expect(editBlock).toContain('resolveAccess(db, userId, comment.teamThreadId)');
    expect(deleteBlock).toContain('resolveAccess(db, userId, comment.teamThreadId)');
  });
});
