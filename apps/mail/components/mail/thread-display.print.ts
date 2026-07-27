import { escapeHtml } from '@/lib/escape-html';
import { cleanHtml } from '@/lib/email-utils';
import type { ParsedMessage } from '@/types';
import { format } from 'date-fns';
import { log } from '@/lib/log';
import { toast } from 'sonner';

import { PRINT_IFRAME_SANDBOX, PRINT_STYLES } from './print-styles';

// printThread — builds a print-ready HTML document for a whole thread and prints
// it via a hidden iframe. Extracted verbatim from thread-display.tsx (behaviour
// unchanged); the print CSS is shared through PRINT_STYLES.

type ParsedThreadData = { latest?: ParsedMessage | null; messages: ParsedMessage[] };

const formatFileSize = (size: number) => {
  const sizeInMB = (size / (1024 * 1024)).toFixed(2);
  return sizeInMB === '0.00' ? '' : `${sizeInMB} MB`;
};

const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  return name.replace(/["<>]/g, '');
};

/**
 * Construit le document d'impression du fil. Exporté pour être éprouvé tel quel : c'est
 * EXACTEMENT la chaîne que `printThread` remet à `iframeDoc.write` ci-dessous.
 *
 * XSS STOCKÉ (corrigé) — même traitement que `buildMailPrintDocument`. Noter que les
 * adresses e-mail étaient ici encadrées de VRAIS chevrons (`<${email}>`), ce qui ouvrait
 * une balise réelle dans le document ; elles sont désormais encadrées d'entités et leur
 * contenu est échappé.
 */
export function buildThreadPrintDocument(emailData: ParsedThreadData): string {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Print Thread - ${escapeHtml(emailData?.latest?.subject) || 'No Subject'}</title>
          <style>${PRINT_STYLES}</style>
        </head>
        <body>
          ${emailData?.messages
            ?.map(
              (message, index) => `
            <div class="email-container">
              <div class="email-header">
                ${index === 0 ? `<h1 class="email-title">${escapeHtml(message.subject) || 'No Subject'}</h1>` : ''}


                ${
                  message?.tags && message.tags.length > 0
                    ? `
                  <div class="labels-section">
                    ${message.tags
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
                      ${escapeHtml(cleanNameDisplay(message.sender?.name))}
                      ${message.sender?.email ? `&lt;${escapeHtml(message.sender.email)}&gt;` : ''}
                    </span>
                  </div>


                  ${
                    message.to && message.to.length > 0
                      ? `
                    <div class="meta-row">
                      <span class="meta-label">To:</span>
                      <span class="meta-value">
                        ${message.to
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
                    message.cc && message.cc.length > 0
                      ? `
                    <div class="meta-row">
                      <span class="meta-label">CC:</span>
                      <span class="meta-value">
                        ${message.cc
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
                    message.bcc && message.bcc.length > 0
                      ? `
                    <div class="meta-row">
                      <span class="meta-label">BCC:</span>
                      <span class="meta-value">
                        ${message.bcc
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
                    <span class="meta-value">${escapeHtml(format(new Date(message.receivedOn), 'PPpp'))}</span>
                  </div>
                </div>
              </div>

              <div class="separator"></div>

              <div class="email-body">
                <div class="email-content">
                  ${cleanHtml(message.decodedBody ?? '<p><em>No email content available</em></p>')}
                </div>
              </div>


              ${
                message.attachments && message.attachments.length > 0
                  ? `
                <div class="attachments-section">
                  <h2 class="attachments-title">Attachments (${message.attachments.length})</h2>
                  ${message.attachments
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
            ${index < emailData.messages.length - 1 ? '<div class="separator"></div>' : ''}
          `,
            )
            .join('')}
        </body>
      </html>
    `;
}

export function printThread(emailData: ParsedThreadData) {
  try {
    // Create a hidden iframe for printing
    const printFrame = document.createElement('iframe');
    // Même politique de bac à sable que `printMail` — voir PRINT_IFRAME_SANDBOX.
    printFrame.setAttribute('sandbox', PRINT_IFRAME_SANDBOX);
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-9999px';
    printFrame.style.left = '-9999px';
    printFrame.style.width = '0px';
    printFrame.style.height = '0px';
    printFrame.style.border = 'none';

    document.body.appendChild(printFrame);

    // Generate clean, simple HTML content for printing
    const printContent = buildThreadPrintDocument(emailData);

    // Write content to the iframe
    const iframeDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Could not access iframe document');
    }
    iframeDoc.open();
    iframeDoc.write(printContent);
    iframeDoc.close();

    // Wait for content to load, then print
    printFrame.onload = function () {
      setTimeout(() => {
        try {
          // Focus the iframe and print
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();

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
  } catch (error) {
    log.error('Error printing thread:', error);
    toast.error('Failed to print thread. Please try again.');
  }
}
