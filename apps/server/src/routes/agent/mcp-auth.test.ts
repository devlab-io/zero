import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { logger } from '../../lib/logger';
import { OAuthProtectedResourceMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  buildMcpProtectedResourceMetadata,
  mcpProtectedResourceMetadataUrl,
  mcpUnauthorizedResponse,
} from './mcp-auth';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MCP authentication boundary', () => {
  it('never writes bearer or cookie values when invalid auth metadata reaches the logger', () => {
    const sink = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info(
      'Invalid auth provided',
      Array.from(
        new Headers({
          Authorization: 'Bearer mcp-super-secret-token',
          Cookie: 'better-auth.session_token=session-super-secret',
        }).entries(),
      ),
    );

    const output = sink.mock.calls.flat().join('\n');
    expect(output).not.toContain('mcp-super-secret-token');
    expect(output).not.toContain('session-super-secret');
  });

  it('redacts structured bodies, credentials, and secrets embedded in errors', () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.error('MCP request failed', new Error('Authorization: Bearer error-token'), {
      body: 'private mail body',
      clientSecret: 'oauth-client-secret',
      safeCause: 'invalid_token',
    });

    const output = sink.mock.calls.flat().join('\n');
    expect(output).not.toContain('error-token');
    expect(output).not.toContain('private mail body');
    expect(output).not.toContain('oauth-client-secret');
    expect(output).toContain('invalid_token');
  });

  it('publishes path-aware protected-resource metadata for the exact MCP URL', () => {
    const metadata = buildMcpProtectedResourceMetadata('https://mail.example.com/mcp');
    expect(() => OAuthProtectedResourceMetadataSchema.parse(metadata)).not.toThrow();
    expect(metadata).toMatchObject({
      resource: 'https://mail.example.com/mcp',
      authorization_servers: ['https://mail.example.com'],
      bearer_methods_supported: ['header'],
    });
    expect(mcpProtectedResourceMetadataUrl('https://mail.example.com/mcp')).toBe(
      'https://mail.example.com/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('returns a compliant challenge from every MCP 401 path', () => {
    const response = mcpUnauthorizedResponse('https://mail.example.com/mcp');
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://mail.example.com/.well-known/oauth-protected-resource/mcp"',
    );
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('WWW-Authenticate');

    const routeSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../index.ts'),
      'utf8',
    );
    const mcpMount = routeSource.slice(routeSource.indexOf(".mount(\n    '/mcp'"));
    expect(mcpMount.match(/mcpUnauthorizedResponse\(env\.VITE_PUBLIC_BACKEND_URL\)/g)).toHaveLength(
      2,
    );
    expect(routeSource).toContain(".get('/.well-known/oauth-protected-resource/mcp'");
    expect(routeSource).toContain('oAuthDiscoveryMetadata(auth)');
  });
});
