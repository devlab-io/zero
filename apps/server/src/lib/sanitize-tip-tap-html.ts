import sanitizeHtml from 'sanitize-html';
import { v4 as uuidv4 } from 'uuid';

interface InlineImage {
  cid: string;
  data: string;
  mimeType: string;
}

// Devlab/perf — ce module était la SEULE arête statique du serveur vers
// `@react-email/components`, et par ce barrel vers react-dom (723 kB),
// prettier (636 kB, en deux copies), prismjs et tailwind/postcss : près de
// 2,9 Mio de graphe statique, parsés à chaque démarrage d'isolate.
//
// Ce que ces 2,9 Mio produisaient, capturé sur l'implémentation d'origine :
//   <!DOCTYPE …><html dir="ltr" lang="en"><head></head>
//   <!--$--><div>{html}</div><!--1--><!--/$--></html>
// Le composant `Html` de react-email ne pose que `dir` et `lang` ; `render()`
// préfixe le doctype XHTML transitionnel ; le contenu est inséré verbatim,
// sans échappement — le gabarit littéral est donc équivalent.
//
// SEULE DIVERGENCE ASSUMÉE : les trois marqueurs de flux `<!--$-->`,
// `<!--1-->` et `<!--/$-->` ne sont pas reproduits. Ce sont des artefacts du
// moteur de rendu streamé de React 19, sans signification dans un corps de
// message. Le `<head></head>`, lui, est conservé : les clients de messagerie
// s'attendent à un document complet. Verrouillé par le test voisin.
const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/** Enveloppe le corps assaini dans le même document que produisait react-email. */
export const wrapInEmailDocument = (innerHtml: string): string =>
  `${DOCTYPE}<html dir="ltr" lang="en"><head></head><div>${innerHtml}</div></html>`;

export const sanitizeTipTapHtml = async (
  html: string,
): Promise<{ html: string; inlineImages: InlineImage[] }> => {
  const inlineImages: InlineImage[] = [];

  const processedHtml = html.replace(
    /<img[^>]+src=["']data:([^;]+);base64,([^"']+)["'][^>]*>/gi,
    (match, mimeType, base64Data) => {
      const cid = `image_${uuidv4()}@0.email`;
      inlineImages.push({
        cid,
        data: base64Data,
        mimeType,
      });

      return match.replace(/src=["']data:[^"']+["']/i, `src="cid:${cid}"`);
    },
  );

  const clean = sanitizeHtml(processedHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'style'],
    },
    allowedSchemes: ['http', 'https', 'cid', 'data'],
  });

  return {
    html: wrapInEmailDocument(clean),
    inlineImages,
  };
};
