import { router, privateProcedure } from '../trpc';
import { TtlCache } from '../../lib/ttl-cache';
import { logger } from '../../lib/logger';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

// Resolution BIMI mise en cache PAR DOMAINE (pitbull A13, axe 6).
//
// Avant : chaque ligne de la liste d'inbox appelait `getByEmail`, qui refaisait une
// resolution DNS sortante (dns.google) PUIS un telechargement du logo — par ADRESSE, sans
// aucun cache serveur. Cinquante lignes de la meme entreprise = cinquante resolutions
// identiques. Le cout est paye sur le chemin de rendu de la liste, a chaque montage.
//
// Deux etages, aucun binding nouveau a provisionner :
//  - un cache d'isolate borne (TtlCache), qui absorbe la rafale d'une meme page ;
//  - le Cache API du colo (`caches.default`), qui survit au recyclage de l'isolate et se
//    partage entre requetes, avec un TTL de 24 h — un enregistrement BIMI ne bouge pas dans
//    la journee.
// `getByEmail` reduit desormais l'adresse a son domaine et emprunte le meme cache que
// `getByDomain` : les deux procedures ne peuvent plus diverger.

type ResolvedBimi = {
  domain: string;
  bimiRecord: { version?: string; logoUrl?: string; authorityUrl?: string } | null;
  logo: { url: string; svgContent: string } | null;
};

const ISOLATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const COLO_CACHE_TTL_SECONDS = 24 * 60 * 60;
const isolateCache = new TtlCache<ResolvedBimi>(ISOLATE_CACHE_TTL_MS, 500);

// --- Bornes du fetch sortant (SSRF authentifiée) -------------------------------------
//
// Le champ `l=` de l'enregistrement TXT est choisi par QUI CONTRÔLE LE DOMAINE interrogé,
// et son corps était rendu au client : n'importe quel utilisateur connecté pouvait faire
// émettre au worker une requête https vers une URL de son choix et en lire la réponse.
// Trois verrous : l'hôte du logo doit appartenir au domaine interrogé, la réponse est
// plafonnée, et l'appel est borné dans le temps.
const FETCH_TIMEOUT_MS = 5_000;
const MAX_LOGO_BYTES = 256 * 1024;
const MAX_DNS_BYTES = 64 * 1024;

/**
 * Nom d'hôte DNS : au moins deux étiquettes, tirets ni en tête ni en queue, 253 caractères
 * au plus. Le TLD doit porter une lettre — ce qui écarte les littéraux IPv4 au passage.
 */
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Domaine normalisé, ou `null` si ce n'est pas un nom d'hôte. */
export const normalizeDomain = (raw: string): string | null => {
  const domain = raw.trim().toLowerCase().replace(/\.$/, '');
  return HOSTNAME_PATTERN.test(domain) ? domain : null;
};

/** `mail.example.com` → `example.com`. Approximation assumée : les deux dernières étiquettes. */
const apexOf = (domain: string) => domain.split('.').slice(-2).join('.');

/**
 * Le logo doit venir du domaine interrogé, d'un de ses sous-domaines, ou de son apex. Un CDN
 * sur un sous-domaine FRÈRE est refusé volontairement : la dégradation est « pas de logo »,
 * jamais « le worker va chercher l'URL de l'attaquant ».
 */
export const isLogoHostAllowed = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`) || host === apexOf(domain);

/** Lit un corps de réponse en refusant de dépasser `maxBytes`. */
const readBounded = async (response: Response, maxBytes: number): Promise<string | null> => {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const body = response.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

/** Clé d'URL synthétique : le Cache API indexe par requête, pas par chaîne libre. */
const cacheKeyFor = (domain: string) =>
  `https://bimi-cache.zero.internal/${encodeURIComponent(domain)}`;

const parseBimiRecord = (record: string) => {
  const parts = record.split(';').map((part) => part.trim());
  const result: { version?: string; logoUrl?: string; authorityUrl?: string } = {};

  for (const part of parts) {
    if (part.startsWith('v=')) {
      result.version = part.substring(2);
    } else if (part.startsWith('l=')) {
      result.logoUrl = part.substring(2);
    } else if (part.startsWith('a=')) {
      result.authorityUrl = part.substring(2);
    }
  }

  return result;
};

const fetchDnsRecord = async (domain: string): Promise<string | null> => {
  try {
    // `domain` est déjà validé par `normalizeDomain`, mais il est ENCODÉ quand même : la
    // concaténation nue laissait un `&` ou un `#` réécrire la requête adressée à dns.google.
    const response = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(`default._bimi.${domain}`)}&type=TXT`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );

    if (!response.ok) {
      return null;
    }

    const payload = await readBounded(response, MAX_DNS_BYTES);
    if (!payload) return null;

    const data = JSON.parse(payload) as {
      Status: number;
      Answer?: Array<{ data: string }>;
    };

    if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
      return null;
    }

    const bimiRecord = data.Answer.find((answer) => answer.data.includes('v=BIMI1'));

    if (!bimiRecord) {
      return null;
    }

    return bimiRecord.data.replace(/"/g, '');
  } catch (error) {
    logger.error(`Error fetching BIMI record for ${domain}:`, error);
    return null;
  }
};

const fetchLogoContent = async (logoUrl: string, domain: string): Promise<string | null> => {
  try {
    const url = new URL(logoUrl);
    if (url.protocol !== 'https:') {
      return null;
    }
    // Le verrou anti-SSRF : l'URL vient de l'enregistrement TXT, donc de l'attaquant dès
    // qu'il contrôle le domaine interrogé. Sans cet ancrage, le worker allait chercher
    // n'importe quelle URL https et en reversait le corps à l'appelant.
    if (!isLogoHostAllowed(url.hostname.toLowerCase(), domain)) {
      return null;
    }

    const response = await fetch(url, {
      headers: {
        Accept: 'image/svg+xml',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('svg')) {
      return null;
    }

    const svgContent = await readBounded(response, MAX_LOGO_BYTES);
    if (!svgContent) return null;

    if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
      return null;
    }

    return svgContent;
  } catch (error) {
    logger.error(`Error fetching logo from ${logoUrl}:`, error);
    return null;
  }
};

const resolveBimiForDomain = async (domain: string): Promise<ResolvedBimi> => {
  const cached = isolateCache.get(domain);
  if (cached) return cached;

  const cache = caches.default;
  const request = new Request(cacheKeyFor(domain));

  try {
    const hit = await cache.match(request);
    if (hit) {
      const stored = (await hit.json()) as ResolvedBimi;
      isolateCache.set(domain, stored);
      return stored;
    }
  } catch (error) {
    // Un cache illisible ne doit jamais empêcher la résolution.
    logger.warn(`[bimi] cache read failed for ${domain}`, error);
  }

  const bimiRecordText = await fetchDnsRecord(domain);
  let resolved: ResolvedBimi = { domain, bimiRecord: null, logo: null };

  if (bimiRecordText) {
    const bimiRecord = parseBimiRecord(bimiRecordText);
    let logo: ResolvedBimi['logo'] = null;
    if (bimiRecord.logoUrl) {
      const svgContent = await fetchLogoContent(bimiRecord.logoUrl, domain);
      if (svgContent) logo = { url: bimiRecord.logoUrl, svgContent };
    }
    resolved = { domain, bimiRecord, logo };
  }

  isolateCache.set(domain, resolved);
  try {
    await cache.put(
      request,
      new Response(JSON.stringify(resolved), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${COLO_CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch (error) {
    logger.warn(`[bimi] cache write failed for ${domain}`, error);
  }

  return resolved;
};

export const bimiRouter = router({
  getByEmail: privateProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .output(
      z.object({
        domain: z.string(),
        bimiRecord: z
          .object({
            version: z.string().optional(),
            logoUrl: z.string().optional(),
            authorityUrl: z.string().optional(),
          })
          .nullable(),
        logo: z
          .object({
            url: z.string(),
            svgContent: z.string(),
          })
          .nullable(),
      }),
    )
    .query(async ({ input }) => {
      const domain = normalizeDomain(input.email.split('@')[1] ?? '');

      if (!domain) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unable to extract domain from email address',
        });
      }

      return resolveBimiForDomain(domain);
    }),

  getByDomain: privateProcedure
    .input(
      z.object({
        domain: z.string().min(1),
      }),
    )
    .output(
      z.object({
        domain: z.string(),
        bimiRecord: z
          .object({
            version: z.string().optional(),
            logoUrl: z.string().optional(),
            authorityUrl: z.string().optional(),
          })
          .nullable(),
        logo: z
          .object({
            url: z.string(),
            svgContent: z.string(),
          })
          .nullable(),
      }),
    )
    .query(async ({ input }) => {
      // `z.string().min(1)` laissait passer n'importe quoi jusque dans l'URL de dns.google.
      const domain = normalizeDomain(input.domain);

      if (!domain) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid domain' });
      }

      return resolveBimiForDomain(domain);
    }),
});
