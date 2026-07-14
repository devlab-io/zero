/**
 * Lightweight, dependency-free search highlighter — split out of email-utils.client.tsx
 * (job a8-weight-hunt-01, LEAD A). `highlightText` is the ONLY export of that module used on
 * the cold /mail/inbox path (mail-list-thread rows). Keeping it in email-utils.client.tsx forced
 * the cold closure to statically pull that module's heavy graph (@react-email/components,
 * react-dom/server, and via email-utils.ts: zod schemas + `color` + email-addresses), none of
 * which this pure JSX text splitter needs. This module imports NOTHING heavy (lib/log is the
 * dependency-free front logging seam from A5), so the cold list no longer drags those bytes.
 * Pure code motion — identical behaviour, no lazy/preload change.
 */
import { log } from '@/lib/log';

export const highlightText = (text: string, highlight: string) => {
  try {
    if (!highlight?.trim()) return text;

    const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');

    if (!regex.test(text)) return text;
    regex.lastIndex = 0;

    const parts = text.split(regex);

    return parts.map((part, i) => {
      return i % 2 === 1 ? (
        <span
          key={part}
          className="ring-0.5 bg-primary/10 inline-flex items-center justify-center rounded px-1"
        >
          {part}
        </span>
      ) : (
        part
      );
    });
  } catch (error) {
    log.warn('Error highlighting text:', error);
    return text;
  }
};
