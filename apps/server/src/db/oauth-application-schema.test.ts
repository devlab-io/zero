import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { oauthApplication } from './schema';

describe('oauthApplication schema', () => {
  it('exposes the Better Auth MCP redirectUrls field on the existing SQL column', () => {
    const columns = getTableColumns(oauthApplication);

    expect(columns.redirectUrls.name).toBe('redirect_u_r_ls');
    expect(columns).not.toHaveProperty('redirectURLs');
  });
});
