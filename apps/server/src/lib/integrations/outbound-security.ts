/**
 * Sécurité des webhooks SORTANTS Reta (P18) : HTTPS public exigé, défense
 * SSRF en profondeur (schéma, hôte, IP littérale, résolution DNS injectée,
 * refus des redirections), signature HMAC-SHA256 liée timestamp+delivery.
 * `resolveIps`/`fetchImpl` sont INJECTÉS — les tests ne touchent pas le réseau.
 */
import { computeHmacSha256Hex } from './linear-webhook';

export type ResolveIps = (hostname: string) => Promise<string[]>;

export class OutboundUrlError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'OutboundUrlError';
  }
}

const isPrivateV4 = (ip: string): boolean => {
  const parts = ip.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true; // malformé = refusé
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local + métadonnées cloud
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 doc
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast + réservé
  return false;
};

export function isPublicIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed.includes(':')) {
    // IPv6 durci : loopback, non spécifié, ULA fc00::/7, link-local fe80::/10,
    // MULTICAST ff00::/8, documentation 2001:db8::/32, discard 100::/64,
    // NAT64 64:ff9b::/96 (v4 embarquée opaque → refus), mappé IPv4
    // ::ffff:x.x.x.x → l'IPv4 embarquée est classée elle-même.
    if (trimmed === '::1' || trimmed === '::') return false;
    if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) return false;
    if (/^fe[89ab]/.test(trimmed)) return false;
    if (trimmed.startsWith('ff')) return false;
    if (trimmed.startsWith('2001:db8:') || trimmed === '2001:db8::') return false;
    if (trimmed.startsWith('100::')) return false;
    if (trimmed.startsWith('64:ff9b:')) return false;
    const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return !isPrivateV4(mapped[1]!);
    return true;
  }
  return !isPrivateV4(trimmed);
}

const isIpLiteral = (hostname: string): boolean =>
  /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':');

/**
 * Garde SSRF complète : https strict, pas d'userinfo/port exotique interdit
 * non — port laissé libre (https), hôte non-local, IP littérale publique,
 * et TOUTES les IPs résolues publiques (le resolver est injecté ; en prod,
 * DNS-over-HTTPS Cloudflare).
 */
export async function assertPublicHttpsUrl(rawUrl: string, resolveIps: ResolveIps): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new OutboundUrlError('invalid_url');
  }
  if (url.protocol !== 'https:') throw new OutboundUrlError('https_required');
  if (url.username || url.password) throw new OutboundUrlError('userinfo_forbidden');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal')
  ) {
    throw new OutboundUrlError('private_host');
  }
  if (isIpLiteral(hostname)) {
    if (!isPublicIp(hostname)) throw new OutboundUrlError('private_ip');
    return;
  }
  const ips = await resolveIps(hostname);
  if (ips.length === 0) throw new OutboundUrlError('unresolvable_host');
  for (const ip of ips) {
    if (!isPublicIp(ip)) throw new OutboundUrlError('private_ip');
  }
}

/** Résolution DNS-over-HTTPS (prod) — A + AAAA via cloudflare-dns.com. */
export function dohResolver(fetchImpl: typeof fetch): ResolveIps {
  return async (hostname) => {
    const lookup = async (type: 'A' | 'AAAA'): Promise<string[]> => {
      const response = await fetchImpl(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' } },
      );
      if (!response.ok) return [];
      const json = (await response.json()) as { Answer?: Array<{ type: number; data: string }> };
      return (json.Answer ?? [])
        .filter((answer) => answer.type === (type === 'A' ? 1 : 28))
        .map((answer) => answer.data);
    };
    const [v4, v6] = await Promise.all([lookup('A'), lookup('AAAA')]);
    return [...v4, ...v6];
  };
}

/** Signature sortante : HMAC-SHA256 hex de `${timestampMs}.${deliveryId}.${body}`. */
export async function signOutboundPayload(input: {
  secret: string;
  deliveryId: string;
  timestampMs: number;
  body: string;
}): Promise<string> {
  return await computeHmacSha256Hex(
    input.secret,
    new TextEncoder().encode(`${input.timestampMs}.${input.deliveryId}.${input.body}`),
  );
}

export type OutboundDeliveryResult = { ok: true; status: number } | { ok: false; error: string };

/**
 * Livraison signée : garde SSRF au moment de l'envoi (l'URL a pu changer de
 * résolution depuis l'enregistrement), redirections REFUSÉES (manual + 3xx =
 * échec), timeout borné. Le payload est celui de l'outbox — métadonnées
 * seules, jamais un corps email.
 */
export async function deliverSigned(input: {
  fetchImpl: typeof fetch;
  resolveIps: ResolveIps;
  url: string;
  secret: string;
  deliveryId: string;
  eventType: string;
  body: string;
  nowMs: number;
  timeoutMs?: number;
}): Promise<OutboundDeliveryResult> {
  try {
    await assertPublicHttpsUrl(input.url, input.resolveIps);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid_url' };
  }
  const signature = await signOutboundPayload({
    secret: input.secret,
    deliveryId: input.deliveryId,
    timestampMs: input.nowMs,
    body: input.body,
  });
  try {
    const response = await input.fetchImpl(input.url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'X-Reta-Event': input.eventType,
        'X-Reta-Delivery': input.deliveryId,
        'X-Reta-Timestamp': String(input.nowMs),
        'X-Reta-Signature': signature,
      },
      body: input.body,
      signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: 'redirect_refused' };
    }
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : 'network_error' };
  }
}
