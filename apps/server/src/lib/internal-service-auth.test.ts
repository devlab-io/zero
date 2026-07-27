import { describe, expect, it } from 'vitest';

import {
  internalServiceToken,
  isInternalServiceCaller,
  THINKING_MCP_PURPOSE,
} from './internal-service-auth';

const SECRET = 'a-server-side-jwt-secret';

describe('internalServiceToken', () => {
  it('dérive un jeton stable, hexadécimal, de 256 bits', async () => {
    const first = await internalServiceToken(SECRET, THINKING_MCP_PURPOSE);
    const second = await internalServiceToken(SECRET, THINKING_MCP_PURPOSE);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ne rend jamais le secret lui-même', async () => {
    const token = await internalServiceToken(SECRET, THINKING_MCP_PURPOSE);
    expect(token).not.toContain(SECRET);
  });

  it('sépare les usages : deux étiquettes donnent deux jetons', async () => {
    const a = await internalServiceToken(SECRET, THINKING_MCP_PURPOSE);
    const b = await internalServiceToken(SECRET, 'zero:mcp:other:v1');
    expect(a).not.toBe(b);
  });

  it('sépare les secrets : deux secrets donnent deux jetons', async () => {
    const a = await internalServiceToken(SECRET, THINKING_MCP_PURPOSE);
    const b = await internalServiceToken('another-secret', THINKING_MCP_PURPOSE);
    expect(a).not.toBe(b);
  });

  it('rend null quand aucun secret n’est configuré', async () => {
    expect(await internalServiceToken(undefined, THINKING_MCP_PURPOSE)).toBeNull();
    expect(await internalServiceToken('', THINKING_MCP_PURPOSE)).toBeNull();
  });
});

describe('isInternalServiceCaller', () => {
  it('accepte exactement le jeton dérivé', async () => {
    const token = (await internalServiceToken(SECRET, THINKING_MCP_PURPOSE)) as string;
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, token)).toBe(true);
  });

  it('refuse le secret brut présenté tel quel', async () => {
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, SECRET)).toBe(false);
  });

  it('refuse un jeton dérivé pour un autre usage', async () => {
    const other = (await internalServiceToken(SECRET, 'zero:mcp:other:v1')) as string;
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, other)).toBe(false);
  });

  it('refuse un en-tête absent, vide ou tronqué', async () => {
    const token = (await internalServiceToken(SECRET, THINKING_MCP_PURPOSE)) as string;
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, undefined)).toBe(false);
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, '')).toBe(false);
    expect(await isInternalServiceCaller(SECRET, THINKING_MCP_PURPOSE, token.slice(0, -1))).toBe(
      false,
    );
  });

  it('refuse tout quand le secret serveur est absent — fail-closed', async () => {
    const token = (await internalServiceToken(SECRET, THINKING_MCP_PURPOSE)) as string;
    expect(await isInternalServiceCaller(undefined, THINKING_MCP_PURPOSE, token)).toBe(false);
    expect(await isInternalServiceCaller('', THINKING_MCP_PURPOSE, token)).toBe(false);
  });
});
