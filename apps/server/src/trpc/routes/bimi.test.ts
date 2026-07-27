import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Preuve du verrou anti-SSRF de la résolution BIMI.
 *
 * Constat : `domain: z.string().min(1)` était concaténé sans encodage dans l'URL de
 * dns.google, puis le champ `l=` de l'enregistrement TXT — URL choisie par qui contrôle le
 * domaine — était fetché et son corps rendu au client. Un utilisateur connecté disposait
 * donc d'un fetch sortant arbitraire avec lecture de la réponse.
 *
 * Couture identique à mail.test.ts : `../trpc` est remplacé par un builder qui capture
 * schéma d'entrée et resolver ; `fetch` et `caches` sont des faux en mémoire.
 */
interface ProcBuilder {
  input: (inputSchema: unknown) => ProcBuilder;
  output: (outputSchema: unknown) => ProcBuilder;
  query: (resolver: unknown) => Record<string, unknown>;
  mutation: (resolver: unknown) => Record<string, unknown>;
}

const procBuild = (partial: Record<string, unknown> = {}): ProcBuilder => ({
  input: (inputSchema: unknown) => procBuild({ ...partial, inputSchema }),
  output: (outputSchema: unknown) => procBuild({ ...partial, outputSchema }),
  query: (resolver: unknown) => ({ ...partial, resolver, kind: 'query' }),
  mutation: (resolver: unknown) => ({ ...partial, resolver, kind: 'mutation' }),
});

vi.mock('../trpc', () => ({
  router: (defs: unknown) => defs,
  privateProcedure: procBuild(),
  activeDriverProcedure: procBuild(),
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
vi.stubGlobal('caches', {
  default: { match: vi.fn(async () => undefined), put: vi.fn(async () => {}) },
});

type Resolved = {
  domain: string;
  bimiRecord: unknown;
  logo: { url: string; svgContent: string } | null;
};

type BimiModule = {
  bimiRouter: Record<
    string,
    {
      inputSchema: { parse: (value: unknown) => unknown };
      resolver: (args: { input: unknown }) => Promise<Resolved>;
    }
  >;
  normalizeDomain: (raw: string) => string | null;
  isLogoHostAllowed: (host: string, domain: string) => boolean;
};

const { bimiRouter, normalizeDomain, isLogoHostAllowed } = (await import(
  './bimi'
)) as unknown as BimiModule;

const call = async (name: string, rawInput: unknown) => {
  const proc = bimiRouter[name];
  const input = proc.inputSchema.parse(rawInput);
  return proc.resolver({ input });
};

const dnsResponse = (logoUrl: string) =>
  new Response(JSON.stringify({ Status: 0, Answer: [{ data: `"v=BIMI1; l=${logoUrl}"` }] }), {
    headers: { 'content-type': 'application/json' },
  });

const svgResponse = (body = '<svg></svg>') =>
  new Response(body, { headers: { 'content-type': 'image/svg+xml' } });

/** Domaine neuf à chaque test : les deux étages de cache sont indexés par domaine. */
let counter = 0;
const freshDomain = () => `d${++counter}.example.com`;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('normalizeDomain — le domaine n’est plus une chaîne libre', () => {
  it('accepte un nom d’hôte, normalise casse et point final', () => {
    expect(normalizeDomain('Example.COM')).toBe('example.com');
    expect(normalizeDomain('mail.example.com.')).toBe('mail.example.com');
  });

  it('refuse ce qui n’est pas un nom d’hôte', () => {
    for (const bad of [
      '',
      'localhost',
      'example.com&type=A',
      'example.com/../evil',
      'example.com#x',
      'example.com?x=1',
      'exa mple.com',
      'http://example.com',
      '-example.com',
      '127.0.0.1',
      '169.254.169.254',
      `${'a'.repeat(300)}.com`,
    ]) {
      expect(normalizeDomain(bad), bad).toBeNull();
    }
  });
});

describe('isLogoHostAllowed — le logo est ancré au domaine interrogé', () => {
  it('accepte le domaine, ses sous-domaines et son apex', () => {
    expect(isLogoHostAllowed('example.com', 'example.com')).toBe(true);
    expect(isLogoHostAllowed('cdn.example.com', 'example.com')).toBe(true);
    expect(isLogoHostAllowed('example.com', 'mail.example.com')).toBe(true);
  });

  it('refuse tout hôte tiers', () => {
    expect(isLogoHostAllowed('evil.test', 'example.com')).toBe(false);
    expect(isLogoHostAllowed('example.com.evil.test', 'example.com')).toBe(false);
    expect(isLogoHostAllowed('169.254.169.254', 'example.com')).toBe(false);
    expect(isLogoHostAllowed('metadata.internal', 'example.com')).toBe(false);
  });
});

describe('getByDomain — frontière', () => {
  it('rejette un domaine qui n’en est pas un', async () => {
    await expect(call('getByDomain', { domain: 'example.com&type=A' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encode le nom interrogé dans l’URL de dns.google', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ Status: 3 })));
    const domain = freshDomain();

    await call('getByDomain', { domain });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://dns.google/resolve?name=default._bimi.${domain}&type=TXT`,
    );
  });
});

describe('résolution du logo — SSRF fermée', () => {
  it('ne fetche PAS un logo hébergé sur un hôte tiers', async () => {
    const domain = freshDomain();
    fetchMock.mockResolvedValueOnce(dnsResponse('https://169.254.169.254/latest/meta-data'));

    const result = await call('getByDomain', { domain });

    expect(result.logo).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // le DNS seul, jamais le logo
  });

  it('fetche le logo quand il est servi par le domaine interrogé', async () => {
    const domain = freshDomain();
    fetchMock
      .mockResolvedValueOnce(dnsResponse(`https://${domain}/logo.svg`))
      .mockResolvedValueOnce(svgResponse());

    const result = await call('getByDomain', { domain });

    expect(result.logo?.svgContent).toContain('<svg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('borne le fetch dans le temps et refuse la redirection', async () => {
    const domain = freshDomain();
    fetchMock
      .mockResolvedValueOnce(dnsResponse(`https://${domain}/logo.svg`))
      .mockResolvedValueOnce(svgResponse());

    await call('getByDomain', { domain });

    const logoInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(logoInit.redirect).toBe('error');
    expect(logoInit.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuse un corps de logo au-delà du plafond', async () => {
    const domain = freshDomain();
    const huge = `<svg>${'x'.repeat(300 * 1024)}</svg>`;
    fetchMock
      .mockResolvedValueOnce(dnsResponse(`https://${domain}/logo.svg`))
      .mockResolvedValueOnce(svgResponse(huge));

    const result = await call('getByDomain', { domain });

    expect(result.logo).toBeNull();
  });

  it('refuse un logo non-https', async () => {
    const domain = freshDomain();
    fetchMock.mockResolvedValueOnce(dnsResponse(`http://${domain}/logo.svg`));

    const result = await call('getByDomain', { domain });

    expect(result.logo).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getByEmail — même frontière que getByDomain', () => {
  it('rejette une adresse dont le domaine n’est pas un nom d’hôte', async () => {
    await expect(call('getByEmail', { email: 'a@localhost' })).rejects.toThrow();
  });
});
