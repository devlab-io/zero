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
    const response = await fetch(
      `https://dns.google/resolve?name=default._bimi.${domain}&type=TXT`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
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

const fetchLogoContent = async (logoUrl: string): Promise<string | null> => {
  try {
    const url = new URL(logoUrl);
    if (url.protocol !== 'https:') {
      return null;
    }

    const response = await fetch(logoUrl, {
      headers: {
        Accept: 'image/svg+xml',
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('svg')) {
      return null;
    }

    const svgContent = await response.text();

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
      const svgContent = await fetchLogoContent(bimiRecord.logoUrl);
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
      const domain = input.email.split('@')[1];

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
      return resolveBimiForDomain(input.domain);
    }),
});
