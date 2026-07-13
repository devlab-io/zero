import type { Attachment, ParsedMessage } from '@/types';
import { cleanHtml } from '@/lib/email-utils';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

import { PRINT_STYLES } from './print-styles';

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

export function printMail(
  emailData: ParsedMessage,
  messageAttachments: Attachment[] | undefined,
) {
    try {
      // Create a hidden iframe for printing
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'absolute';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '0px';
      printFrame.style.height = '0px';
      printFrame.style.border = 'none';

      document.body.appendChild(printFrame);

      // Generate clean, simple HTML content for printing
      const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Print Email - ${emailData.subject || 'No Subject'}</title>
          <style>${PRINT_STYLES}</style>
        </head>
        <body>
          <div class="email-container">
            <!-- Email Header -->
            <div class="email-header">
              <h1 class="email-title">${emailData.subject || 'No Subject'}</h1>

              ${
                emailData?.tags && emailData.tags.length > 0
                  ? `
                <div class="labels-section">
                  ${emailData.tags
                    .map((tag) => `<span class="label-badge">${tag.name}</span>`)
                    .join('')}
                </div>
              `
                  : ''
              }

              <div class="email-meta">
                <div class="meta-row">
                  <span class="meta-label">From:</span>
                  <span class="meta-value">
                    ${cleanNameDisplay(emailData.sender?.name)}
                    ${emailData.sender?.email ? `&lt;${emailData.sender.email}&gt;` : ''}
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
                            `${cleanNameDisplay(recipient.name)} &lt;${recipient.email}&gt;`,
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
                            `${cleanNameDisplay(recipient.name)} &lt;${recipient.email}&gt;`,
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
                            `${cleanNameDisplay(recipient.name)} &lt;${recipient.email}&gt;`,
                        )
                        .join(', ')}
                    </span>
                  </div>
                `
                    : ''
                }

                <div class="meta-row">
                  <span class="meta-label">Date:</span>
                  <span class="meta-value">${formatDate(emailData.receivedOn)}</span>
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
                    <span class="attachment-name">${attachment.filename}</span>
                    ${formatFileSize(attachment.size) ? ` - <span class="attachment-size">${formatFileSize(attachment.size)}</span>` : ''}
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
                console.error('Failed to get iframe window');
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
              console.error('Error during print:', error);
              // Clean up on error
              if (printFrame && printFrame.parentNode) {
                document.body.removeChild(printFrame);
              }
            }
          }, 500);
        };
      }
    } catch (error) {
      console.error('Error printing email:', error);
      toast.error('Failed to print email. Please try again.');
    }
  };
