import DOMPurify from 'dompurify';
import { log } from '@/lib/log';
import Color from 'color';
import { z } from 'zod';

// parseFrom / parseAddressList / getListUnsubscribeAction / cleanEmailAddresses /
// formatRecipients / formatMimeRecipients / wasSentWithTLS moved to
// packages/types/src/email-utils.ts (pitbull quality/pitbull, GAP 1) — this
// file was ~150 lines near-identical to apps/server/src/lib/email-utils.ts.
// Re-exported here so every existing `from '@/lib/email-utils'` import keeps
// working unchanged. What stays here is DOM-only (fixNonReadableColors,
// cleanHtml) or client-only (the queued/scheduled send-result schemas, which
// have no server counterpart).
export {
  getListUnsubscribeAction,
  parseFrom,
  parseAddressList,
  cleanEmailAddresses,
  formatRecipients,
  formatMimeRecipients,
  wasSentWithTLS,
} from '@zero/types';

export const fixNonReadableColors = (
  rootElement: HTMLElement,
  options?: { minContrast?: number; defaultBackground?: string },
) => {
  const { minContrast = 3.5, defaultBackground = '#ffffff' } = options || {};
  const elements = Array.from<HTMLElement>(rootElement.querySelectorAll('*'));
  elements.unshift(rootElement);

  for (const el of elements) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    // Skip if the color is a CSS variable or special value
    if (
      style.color.startsWith('var(') ||
      style.color === 'transparent' ||
      style.color === 'inherit'
    ) {
      continue;
    }

    try {
      const textColor = Color(style.color);
      const effectiveBg = getEffectiveBackgroundColor(el, defaultBackground);

      const blendedText =
        textColor.alpha() < 1 ? effectiveBg.mix(textColor, effectiveBg.alpha()) : textColor;
      const contrast = blendedText.contrast(effectiveBg);

      if (contrast < minContrast) {
        const blackContrast = Color('#000000').contrast(effectiveBg);
        const whiteContrast = Color('#ffffff').contrast(effectiveBg);
        el.style.color = blackContrast >= whiteContrast ? '#000000' : '#ffffff';
      }
    } catch (error) {
      log.error('Error fixing non-readable colors:', error);
    }
  }
};

const getEffectiveBackgroundColor = (element: HTMLElement, defaultBackground: string) => {
  let current: HTMLElement | null = element;
  while (current) {
    const bg = Color(getComputedStyle(current).backgroundColor);
    if (bg.alpha() >= 1) return bg.rgb();
    current = current.parentElement;
  }
  return Color(defaultBackground);
};

// cleans up html string for xss attacks and returns html
export const cleanHtml = (html: string) => {
  if (!html) return '<p><em>No email content available</em></p>';

  try {
    return DOMPurify.sanitize(html);
  } catch (error) {
    log.warn('DOMPurify Failed or not Available, falling back to Default HTML ', error);
    return '<p><em>No email content available</em></p>';
  }
};

export const queuedSendEmailResultSchema = z.object({
  queued: z.literal(true),
  messageId: z.string(),
  sendAt: z.number().optional(),
});

export const scheduledSendEmailResultSchema = z.object({
  scheduled: z.literal(true),
  messageId: z.string(),
  sendAt: z.number().optional(),
});

export type QueuedSendEmailResult = z.infer<typeof queuedSendEmailResultSchema>;
export type ScheduledSendEmailResult = z.infer<typeof scheduledSendEmailResultSchema>;

export const isQueuedSendResult = (value: unknown): value is QueuedSendEmailResult => {
  return queuedSendEmailResultSchema.safeParse(value).success;
};

export const isScheduledSendResult = (value: unknown): value is ScheduledSendEmailResult => {
  return scheduledSendEmailResultSchema.safeParse(value).success;
};

export const isSendResult = (
  value: unknown,
): value is QueuedSendEmailResult | ScheduledSendEmailResult => {
  return isQueuedSendResult(value) || isScheduledSendResult(value);
};
