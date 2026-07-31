import { acquireQueryClient } from './query-client-pool';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

const make = () => new QueryClient();

describe('query-client-pool — isolation par compte, rétention au switch', () => {
  it('admin→Thomas→admin : deux caches isolés, celui du retour intact', () => {
    const pool = new Map<string, QueryClient>();

    const admin = acquireQueryClient('user1-admin', make, pool);
    admin.setQueryData(['inbox'], ['mail-admin-1']);

    const thomas = acquireQueryClient('user1-thomas', make, pool);
    thomas.setQueryData(['inbox'], ['mail-thomas-1']);

    // Isolation : le client de Thomas ne voit jamais les données d'admin.
    expect(thomas).not.toBe(admin);
    expect(thomas.getQueryData(['inbox'])).toEqual(['mail-thomas-1']);
    expect(admin.getQueryData(['inbox'])).toEqual(['mail-admin-1']);

    // Retour : MÊME instance, cache chaud — rendu instantané avant revalidation.
    const adminBack = acquireQueryClient('user1-admin', make, pool);
    expect(adminBack).toBe(admin);
    expect(adminBack.getQueryData(['inbox'])).toEqual(['mail-admin-1']);
  });

  it('une écriture après le switch ne touche que le client du compte actif', () => {
    const pool = new Map<string, QueryClient>();
    const admin = acquireQueryClient('user1-admin', make, pool);
    const thomas = acquireQueryClient('user1-thomas', make, pool);

    thomas.setQueryData(['thread', 't1'], 'body-thomas');
    expect(admin.getQueryData(['thread', 't1'])).toBeUndefined();
  });
});
