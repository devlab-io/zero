import type { AppContext, EProviders } from '../types';
import type { Customer } from 'autumn-js';
import { env } from '../env';

// Moved to packages/types/src/utils.ts (pitbull quality/pitbull, GAP 1) — this
// file was ~180 lines near-identical to apps/mail/lib/utils.ts, including a
// real divergence in constructReplyBody (this server copy supports an
// optional quoted-message block; the client copy had silently dropped it).
// Re-exported here so every existing `from '../lib/utils'` / `from './utils'`
// import keeps working unchanged.
export {
  FOLDERS,
  LABELS,
  FOLDER_NAMES,
  FOLDER_TAGS,
  getFolderTags,
  cleanEmailAddress,
  truncateFileName,
  extractFilterValue,
  defaultPageSize,
  createSectionId,
  formatFileSize,
  getFileIcon,
  generateConversationId,
  contentToHTML,
  constructReplyBody,
  getMainSearchTerm,
  parseNaturalLanguageSearch,
  parseNaturalLanguageDate,
  categorySearchValues,
  cleanSearchValue,
} from '@zero/types';

export const parseHeaders = (token: string) => {
  const headers = new Headers();
  headers.set('Cookie', token);
  return headers;
};

/**
 * Mock context for testing
 */
export const c = {
  env,
  json: (data: unknown, status: number) => ({
    data,
    status,
  }),
  text: (data: unknown, status: number) => ({
    data,
    status,
  }),
} as unknown as AppContext;

export const getNotificationsUrl = (provider: EProviders) => {
  return env.DEV_PROXY
    ? `${env.DEV_PROXY}/a8n/notify/${provider}`
    : env.VITE_PUBLIC_BACKEND_URL + '/a8n/notify/' + provider;
};

export async function setSubscribedState(
  connectionId: string,
  providerId: EProviders,
): Promise<void> {
  return await env.subscribed_accounts.put(
    `${connectionId}__${providerId}`,
    new Date().toISOString(),
  );
}

export async function cleanupOnFailure(connectionId: string): Promise<void> {
  return await env.subscribed_accounts.delete(connectionId);
}

const PRO_PLANS = ['pro-example', 'pro_annual', 'team', 'enterprise'] as const;

export const isProCustomer = (customer: Customer) => {
  return customer?.products && Array.isArray(customer.products)
    ? customer.products.some((product) =>
        PRO_PLANS.some((plan) => product.id?.includes(plan) || product.name?.includes(plan)),
      )
    : false;
};
