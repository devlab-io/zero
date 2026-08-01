import { describe, expect, it } from 'vitest';

import {
  buildMcpAuthorizationChallenge,
  buildMcpProtectedResourceMetadata,
  mcpUnauthorizedResponse,
} from './mcp-auth-discovery';

const BACKEND = 'https://zero-server-production.devlab-tahiti.workers.dev';

describe('MCP OAuth protected-resource discovery', () => {
  it('publishes RFC 9728 metadata for the exact MCP resource', () => {
    expect(buildMcpProtectedResourceMetadata(`${BACKEND}/ignored/path`)).toEqual({
      resource: `${BACKEND}/mcp`,
      authorization_servers: [BACKEND],
      scopes_supported: ['openid', 'profile', 'email'],
      bearer_methods_supported: ['header'],
      resource_name: 'Reta Mail MCP',
    });
  });

  it('never advertises offline_access as a protected-resource requirement', () => {
    expect(JSON.stringify(buildMcpProtectedResourceMetadata(BACKEND))).not.toContain(
      'offline_access',
    );
  });

  it('returns a standards-compliant 401 challenge without leaking details', async () => {
    const response = mcpUnauthorizedResponse(BACKEND);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
    expect(response.headers.get('WWW-Authenticate')).toBe(
      `Bearer resource_metadata="${BACKEND}/.well-known/oauth-protected-resource/mcp", scope="openid profile email"`,
    );
  });

  it('normalizes the challenge to the configured backend origin', () => {
    expect(buildMcpAuthorizationChallenge('http://localhost:8787/some/path')).toContain(
      'http://localhost:8787/.well-known/oauth-protected-resource/mcp',
    );
  });
});
