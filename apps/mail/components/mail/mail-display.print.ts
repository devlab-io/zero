import type { Attachment, ParsedMessage } from '@/types';
import { escapeHtml } from '@/lib/escape-html';
import { cleanHtml } from '@/lib/email-utils';
import { formatDate } from '@/lib/date-utils';
import { m } from '@/paraglide/messages';
import { log } from '@/lib/log';
import { toast } from 'sonner';

import { PRINT_IFRAME_SANDBOX, PRINT_STYLES } from './print-styles';

// printMail — builds a print-ready HTML document for a single email and prints it
// via a hidden iframe. Extracted verbatim from mail-display.tsx (behaviour
// unchanged); the print CSS is shared through PRINT_STYLES.

const formatFileSize = (size: number) => {
  const sizeInMB = (size / (1024 * 1024)).toFixed(2);
  return sizeInMB === '0.00' ? '' : `${sizeInMB} MB`;
};

const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  return name.trim();
};

/**
 * Construit le document d'impression. Exporté pour être éprouvé tel quel : c'est
 * EXACTEMENT la chaîne que `printMail` remet à `iframeDoc.write` ci-dessous, pas une
 * réplique de test.
 *
 * XSS STOCKÉ (corrigé) — toute valeur venant de l'e-mail (sujet, étiquettes, nom et
 * adresse de l'expéditeur, destinataires To/CC/BCC, date, nom des pièces jointes) est
 * échappée par `escapeHtml`. Seul le corps passe par `cleanHtml` (DOMPurify), qui doit
 * rester du HTML.
 */
export function buildMailPrintDocument(
  emailData: ParsedMessage,
  messageAttachments: Attachment[] | undefined,
): string {
  const subject = escapeHtml(emailData.subject) || 'No Subject';
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Print Email - ${subject}</title>
          <style>${PRINT_STYLES}</style>
        </head>
        <body>
          <div class="email-container">
            <!-- Email Header -->
            <div class="email-header">
              <h1 class="email-title">${subject}</h1>

              ${
                emailData?.tags && emailData.tags.length > 0
                  ? `
                <div class="labels-section">
                  ${emailData.tags
                    .map((tag) => `<span class="label-badge">${escapeHtml(tag.name)}</span>`)
                    .join('')}
                </div>
              `
                  : ''
              }

              <div class="email-meta">
                <div class="meta-row">
                  <span class="meta-label">From:</span>
                  <span class="meta-value">
                    ${escapeHtml(cleanNameDisplay(emailData.sender?.name))}
                    ${emailData.sender?.email ? `&lt;${escapeHtml(emailData.sender.email)}&gt;` : ''}
                  </span>
                </div>

                ${
                  emailData.to && emailData.to.length > 0
                    ? `
                  <div class="meta-row">
                    <span class="meta-label">To:</span>
                    <span class="meta-value">
                      ${emailData.to
                        .map(
                          (recipient) =>
                            `${escapeHtml(cleanNameDisplay(recipient.name))} &lt;${escapeHtml(recipient.email)}&gt;`,
                        )
                        .join(', ')}
                    </span>
                  </div>
                `
                    : ''
                }

                ${
                  emailData.cc && emailData.cc.length > 0
                    ? `
                  <div class="meta-row">
                    <span class="meta-label">CC:</span>
                    <span class="meta-value">
                      ${emailData.cc
                        .map(
                          (recipient) =>
                            `${escapeHtml(cleanNameDisplay(recipient.name))} &lt;${escapeHtml(recipient.email)}&gt;`,
                        )
                        .join(', ')}
                    </span>
                  </div>
                `
                    : ''
                }

                ${
                  emailData.bcc && emailData.bcc.length > 0
                    ? `
                  <div class="meta-row">
                    <span class="meta-label">BCC:</span>
                    <span class="meta-value">
                      ${emailData.bcc
                        .map(
                          (recipient) =>
                            `${escapeHtml(cleanNameDisplay(recipient.name))} &lt;${escapeHtml(recipient.email)}&gt;`,
                        )
                        .join(', ')}
                    </span>
                  </div>
                `
                    : ''
                }

                <div class="meta-row">
                  <span class="meta-label">Date:</span>
                  <span class="meta-value">${escapeHtml(formatDate(emailData.receivedOn))}</span>
                </div>
              </div>
            </div>

            <div class="separator"></div>

            <!-- Email Body -->
            <div class="email-body">
              <div class="email-content">
                ${cleanHtml(emailData?.decodedBody || '')}
              </div>
            </div>

            <!-- Attachments -->
            ${
              messageAttachments && messageAttachments.length > 0
                ? `
              <div class="attachments-section">
                <h2 class="attachments-title">Attachments (${messageAttachments.length})</h2>
                ${messageAttachments
                  .map(
                    (attachment) => `
                  <div class="attachment-item">
                    <span class="attachment-name">${escapeHtml(attachment.filename)}</span>
                    ${formatFileSize(attachment.size) ? ` - <span class="attachment-size">${escapeHtml(formatFileSize(attachment.size))}</span>` : ''}
                  </div>
                `,
                  )
                  .join('')}
              </div>
            `
                : ''
            }
          </div>
        </body>
      </html>
    `;
}

export function printMail(emailData: ParsedMessage, messageAttachments: Attachment[] | undefined) {
  try {
    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    // Bac à sable SANS `allow-scripts` : voir PRINT_IFRAME_SANDBOX (print-styles.ts).
    printFrame.setAttribute('sandbox', PRINT_IFRAME_SANDBOX);
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    printFrame.style.width = '0px';
    printFrame.style.height = '0px';
    printFrame.style.border = 'none';

    document.body.appendChild(printFrame);

    // Generate clean, simple HTML content for printing
    const printContent = buildMailPrintDocument(emailData, messageAttachments);

    if (printFrame.contentWindow) {
      // Write content to the iframe
      const iframeDoc = printFrame.contentDocument || printFrame.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();

      // Wait for content to load, then print
      printFrame.onload = function () {
        setTimeout(() => {
          try {
            if (!printFrame.contentWindow) {
              log.error('Failed to get iframe window');
              return;
            }
            // Focus the iframe and print
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();

            // Clean up - remove the iframe after a delay
            setTimeout(() => {
              if (printFrame && printFrame.parentNode) {
                document.body.removeChild(printFrame);
              }
            }, 1000);
          } catch (error) {
            log.error('Error during print:', error);
            // Clean up on error
            if (printFrame && printFrame.parentNode) {
              document.body.removeChild(printFrame);
            }
          }
        }, 500);
      };
    }
  } catch (error) {
    log.error('Error printing email:', error);
    toast.error(m['common.mailDisplay.failedToPrint']());
  }
}
