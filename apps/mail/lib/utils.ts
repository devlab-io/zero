import { clsx, type ClassValue } from 'clsx';
import type { Customer } from 'autumn-js';
import { twMerge } from 'tailwind-merge';

// FOLDERS / LABELS / FOLDER_NAMES / FOLDER_TAGS / getFolderTags / cleanEmailAddress /
// truncateFileName / extractFilterValue / defaultPageSize / createSectionId /
// formatFileSize / getFileIcon / generateConversationId / contentToHTML /
// constructReplyBody / constructForwardBody / getMainSearchTerm /
// parseNaturalLanguageSearch / parseNaturalLanguageDate / categorySearchValues /
// cleanSearchValue moved to packages/types/src/utils.ts (pitbull quality/pitbull,
// GAP 1) — this file was ~180 lines near-identical to apps/server/src/lib/utils.ts,
// including a real divergence: this client's constructReplyBody had silently
// dropped the server's `quotedMessage` parameter. Re-exported here so every
// existing `from '@/lib/utils'` import keeps working unchanged. `cn`, `getCookie`,
// `getEmailLogo`, `withExponentialBackoff` and `isProCustomer` stay local:
// DOM/Vite-only or (isProCustomer) would need a new `autumn-js` dependency in
// packages/types to move, which is out of scope here.
//
// Audit : `convertJSONToHTML` a été SUPPRIMÉ. Il construisait du balisage par concaténation
// — `<a href="${json.url}">` et `<img src="${json.url}">` sans le moindre échappement — à
// partir d'un JSON tiptap. Aucun appelant dans le dépôt ; un seul aurait suffi à en faire un
// puits XSS. Retiré plutôt que corrigé : rien n'en dépend.
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
  constructForwardBody,
  getMainSearchTerm,
  parseNaturalLanguageSearch,
  parseNaturalLanguageDate,
  categorySearchValues,
  cleanSearchValue,
} from '@zero/types';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const getCookie = (key: string): string | null => {
  const cookies = Object.fromEntries(
    document.cookie.split('; ').map((v) => v.split(/=(.*)/s).map(decodeURIComponent)),
  );
  return cookies?.[key] ?? null;
};

export const getEmailLogo = (email: string) => {
  if (!import.meta.env.VITE_PUBLIC_IMAGE_API_URL) return '';
  return import.meta.env.VITE_PUBLIC_IMAGE_API_URL + email;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withExponentialBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
): Promise<T> => {
  let retries = 0;
  let delayMs = initialDelay;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }

      const apiError = error as { code?: number; errors?: { reason?: string }[] };
      const isRateLimit =
        apiError?.code === 429 ||
        apiError?.errors?.[0]?.reason === 'rateLimitExceeded' ||
        apiError?.errors?.[0]?.reason === 'userRateLimitExceeded';

      if (!isRateLimit) {
        throw error;
      }

      await delay(delayMs);

      delayMs = Math.min(delayMs * 2 + Math.random() * 1000, maxDelay);
      retries++;
    }
  }
};

const PRO_PLANS = ['pro-example', 'pro_annual', 'team', 'enterprise'] as const;

export const isProCustomer = (customer: Customer) => {
  return customer?.products && Array.isArray(customer.products)
    ? customer.products.some((product) =>
        PRO_PLANS.some((plan) => product.id?.includes(plan) || product.name?.includes(plan)),
      )
    : false;
};
