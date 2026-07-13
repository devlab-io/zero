// print-styles — shared print stylesheet for the mail/thread print modules.
//
// mail-display.print.ts and thread-display.print.ts embedded near-identical
// print CSS (the two blocks differed only by 3 inert lines: 2 comments + 1
// blank line). Sharing this constant removes ~190 LOC of duplicated CSS
// between the two derived modules with no effect on the printed document.

export const PRINT_STYLES = `
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: Arial, sans-serif;
              line-height: 1.5;
              color: #333;
              background: white;
              padding: 20px;
              font-size: 12px;
            }

            .email-container {
              max-width: 100%;
              margin: 0 auto;
              background: white;
            }

            .email-header {
              margin-bottom: 25px;
            }

            .email-title {
              font-size: 18px;
              font-weight: bold;
              color: #000;
              margin-bottom: 15px;
              word-wrap: break-word;
            }

            .email-meta {
              margin-bottom: 20px;
            }

            .meta-row {
              margin-bottom: 5px;
              display: flex;
              align-items: flex-start;
            }

            .meta-label {
              font-weight: bold;
              min-width: 60px;
              color: #333;
              margin-right: 10px;
            }

            .meta-value {
              flex: 1;
              word-wrap: break-word;
              color: #333;
            }

            .separator {
              width: 100%;
              height: 1px;
              background: #ddd;
              margin: 20px 0;
            }

            .email-body {
              margin: 20px 0;
              background: white;
            }

            .email-content {
              word-wrap: break-word;
              overflow-wrap: break-word;
              font-size: 12px;
              line-height: 1.6;
            }

            .email-content img {
              max-width: 100% !important;
              height: auto !important;
              display: block;
              margin: 10px 0;
            }

            .email-content table {
              width: 100%;
              border-collapse: collapse;
              margin: 10px 0;
            }

            .email-content td, .email-content th {
              padding: 6px;
              text-align: left;
              font-size: 11px;
            }

            .email-content a {
              color: #0066cc;
              text-decoration: underline;
            }

            .attachments-section {
              margin-top: 25px;
              background: white;
            }

            .attachments-title {
              font-size: 14px;
              font-weight: bold;
              color: #000;
              margin-bottom: 10px;
            }

            .attachment-item {
              margin-bottom: 5px;
              font-size: 11px;
              padding: 3px 0;
            }

            .attachment-name {
              font-weight: 500;
              color: #333;
            }

            .attachment-size {
              color: #666;
              font-size: 10px;
            }

            .labels-section {
              margin: 10px 0;
            }

            .label-badge {
              display: inline-block;
              padding: 2px 6px;
              background: #f5f5f5;
              color: #333;
              font-size: 10px;
              margin-right: 5px;
              margin-bottom: 3px;
            }

            @media print {
              body {
                margin: 0;
                padding: 15px;
                font-size: 11px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .email-container {
                max-width: none;
                width: 100%;
              }


              .separator {
                background: #000 !important;
              }

              .email-content a {
                color: #000 !important;
              }

              .label-badge {
                background: #f0f0f0 !important;
                border: 1px solid #ccc;
              }

              .no-print {
                display: none !important;
              }

              /* Remove any default borders */
              * {
                border: none !important;
                box-shadow: none !important;
              }

              /* Ensure clean page breaks */
              .email-header {
                page-break-after: avoid;
              }

              .attachments-section {
                page-break-inside: avoid;
              }
            }

            @page {
              margin: 0.5in;
              size: A4;
            }
          `;
