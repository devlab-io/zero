import { renderToString } from 'react-dom/server';
import { Html } from '@react-email/components';
import sanitizeHtml from 'sanitize-html';

export const sanitizeTipTapHtml = async (html: string) => {
  const clean = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
      blockquote: ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'cid', 'data'],
    transformTags: {
      blockquote: (_tagName, attribs) => ({
        tagName: 'blockquote',
        attribs: {
          ...attribs,
          style:
            'border-left: 3px solid #d1d5db; margin: 12px 0; padding-left: 12px; color: #4b5563;',
        },
      }),
    },
  });

  return renderToString(
    <Html>
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </Html>,
  );
};
