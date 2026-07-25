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
// `convertJSONToHTML`, `getEmailLogo`, `withExponentialBackoff` and
// `isProCustomer` stay local: DOM/Vite-only or (isProCustomer) would need a new
// `autumn-js` dependency in packages/types to move, which is out of scope here.
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

export const convertJSONToHTML = (json: any): string => {
  if (!json) return '';

  // Handle different types
  if (typeof json === 'string') return json;
  if (typeof json === 'number' || typeof json === 'boolean') return json.toString();
  if (json === null) return '';

  // Handle arrays
  if (Array.isArray(json)) {
    return json.map((item) => convertJSONToHTML(item)).join('');
  }

  // Handle objects (assuming they might have specific email content structure)
  if (typeof json === 'object') {
    // Check if it's a text node
    if (json.type === 'text') {
      let text = json.text || '';

      // Apply formatting if present
      if (json.bold) text = `<strong>${text}</strong>`;
      if (json.italic) text = `<em>${text}</em>`;
      if (json.underline) text = `<u>${text}</u>`;
      if (json.code) text = `<code>${text}</code>`;

      return text;
    }

    // Handle paragraph
    if (json.type === 'paragraph') {
      return `<p>${convertJSONToHTML(json.children)}</p>`;
    }

    // Handle headings
    if (json.type?.startsWith('heading-')) {
      const level = json.type.split('-')[1];
      return `<h${level}>${convertJSONToHTML(json.children)}</h${level}>`;
    }

    // Handle lists
    if (json.type === 'bulleted-list') {
      return `<ul>${convertJSONToHTML(json.children)}</ul>`;
    }

    if (json.type === 'numbered-list') {
      return `<ol>${convertJSONToHTML(json.children)}</ol>`;
    }

    if (json.type === 'list-item') {
      return `<li>${convertJSONToHTML(json.children)}</li>`;
    }

    // Handle links
    if (json.type === 'link') {
      return `<a href="${json.url}">${convertJSONToHTML(json.children)}</a>`;
    }

    // Handle images
    if (json.type === 'image') {
      return `<img src="${json.url}" alt="${json.alt || ''}" />`;
    }

    // Handle blockquote
    if (json.type === 'block-quote') {
      return `<blockquote>${convertJSONToHTML(json.children)}</blockquote>`;
    }

    // Handle code blocks
    if (json.type === 'code-block') {
      return `<pre><code>${convertJSONToHTML(json.children)}</code></pre>`;
    }

    // If it has children property, process it
    if (json.children) {
      return convertJSONToHTML(json.children);
    }

    // Process all other properties
    return Object.values(json)
      .map((value) => convertJSONToHTML(value))
      .join('');
  }

  return '';
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
