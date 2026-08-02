import {
  assertPublicHttpsUrl,
  deliverSigned,
  isPublicIp,
  signOutboundPayload,
} from './outbound-security';
import { computeHmacSha256Hex } from './linear-webhook';
import { describe, expect, it, vi } from 'vitest';

const publicResolver = async () => ['93.184.216.34'];

describe('SSRF — HTTPS public exigé, IP privées refusées, DNS injecté', () => {
  it('classement IP : privées/loopback/link-local/CGNAT/metadata/multicast refusées, publiques acceptées', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      'ff02::1',
      'ff05::2',
      '2001:db8::1',
      '100::1',
      '64:ff9b::a00:1',
      '::ffff:10.0.0.1',
      '::ffff:169.254.169.254',
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it('http, userinfo, localhost/.internal, IP littérale privée → refus AVANT toute résolution', async () => {
    for (const [url, code] of [
      ['http://example.com/hook', 'https_required'],
      ['https://user:pass@example.com/hook', 'userinfo_forbidden'],
      ['https://localhost/hook', 'private_host'],
      ['https://api.localhost/hook', 'private_host'],
      ['https://metadata.internal/hook', 'private_host'],
      ['https://10.1.2.3/hook', 'private_ip'],
      ['https://[::1]/hook', 'private_ip'],
      ['pas-une-url', 'invalid_url'],
    ] as const) {
      await expect(assertPublicHttpsUrl(url, publicResolver), url).rejects.toThrow(code);
    }
  });

  it('rebinding DNS : un hôte public résolvant vers une IP privée est refusé', async () => {
    await expect(
      assertPublicHttpsUrl('https://evil.example.com/hook', async () => ['10.0.0.5']),
    ).rejects.toThrow('private_ip');
    await expect(
      assertPublicHttpsUrl('https://evil.example.com/hook', async () => [
        '93.184.216.34',
        '169.254.169.254',
      ]),
    ).rejects.toThrow('private_ip');
    await expect(
      assertPublicHttpsUrl('https://ghost.example.com/hook', async () => []),
    ).rejects.toThrow('unresolvable_host');
    await expect(
      assertPublicHttpsUrl('https://ok.example.com/hook', publicResolver),
    ).resolves.toBeUndefined();
  });
});

describe('livraison sortante signée — HMAC lié timestamp+delivery, redirections refusées', () => {
  const base = {
    url: 'https://hooks.example.com/reta',
    secret: 'shared-secret-123456',
    deliveryId: 'del-1',
    eventType: 'thread.status',
    body: JSON.stringify({ event: 'thread.status', deliveryId: 'del-1', payload: {} }),
    nowMs: 1_754_000_000_000,
    resolveIps: publicResolver,
  };

  it('signe `${ts}.${deliveryId}.${body}` et pose les en-têtes X-Reta-*', async () => {
    let captured: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      captured = init.headers as Record<string, string>;
      expect(init.redirect).toBe('manual');
      return new Response('{}', { status: 200 });
    });
    const result = await deliverSigned({
      ...base,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, status: 200 });
    const expected = await signOutboundPayload({
      secret: base.secret,
      deliveryId: base.deliveryId,
      timestampMs: base.nowMs,
      body: base.body,
    });
    expect(captured['X-Reta-Signature']).toBe(expected);
    expect(captured['X-Reta-Delivery']).toBe('del-1');
    expect(captured['X-Reta-Timestamp']).toBe(String(base.nowMs));
    // La signature est bien un HMAC du triplet — recalculable par le récepteur.
    const manual = await computeHmacSha256Hex(
      base.secret,
      new TextEncoder().encode(`${base.nowMs}.del-1.${base.body}`),
    );
    expect(expected).toBe(manual);
  });

  it('3xx = redirect_refused (jamais suivi), 500 = échec http, URL privée = refus sans requête', async () => {
    const redirecting = vi.fn(async () => new Response(null, { status: 302 }));
    expect(
      await deliverSigned({ ...base, fetchImpl: redirecting as unknown as typeof fetch }),
    ).toEqual({ ok: false, error: 'redirect_refused' });

    const failing = vi.fn(async () => new Response('nope', { status: 500 }));
    expect(await deliverSigned({ ...base, fetchImpl: failing as unknown as typeof fetch })).toEqual(
      { ok: false, error: 'http_500' },
    );

    const neverCalled = vi.fn();
    expect(
      await deliverSigned({
        ...base,
        url: 'https://10.0.0.1/hook',
        fetchImpl: neverCalled as unknown as typeof fetch,
      }),
    ).toEqual({ ok: false, error: 'private_ip' });
    expect(neverCalled).not.toHaveBeenCalled();
  });
});
