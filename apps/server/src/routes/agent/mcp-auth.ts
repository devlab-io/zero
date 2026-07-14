const MCP_PATH = '/mcp';
const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource/mcp';

const originFor = (requestUrl: string | URL) => new URL(requestUrl).origin;

export const mcpResourceUrl = (requestUrl: string | URL) =>
  new URL(MCP_PATH, originFor(requestUrl)).href;

export const mcpProtectedResourceMetadataUrl = (requestUrl: string | URL) =>
  new URL(PROTECTED_RESOURCE_PATH, originFor(requestUrl)).href;

export const buildMcpProtectedResourceMetadata = (requestUrl: string | URL) => {
  const origin = originFor(requestUrl);
  return {
    resource: mcpResourceUrl(requestUrl),
    authorization_servers: [origin],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    bearer_methods_supported: ['header'],
  };
};

export const mcpUnauthorizedResponse = (requestUrl: string | URL) => {
  const challenge = `Bearer resource_metadata="${mcpProtectedResourceMetadataUrl(requestUrl)}"`;
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: Authentication required' },
      id: null,
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': challenge,
        'Access-Control-Expose-Headers': 'WWW-Authenticate',
        'Cache-Control': 'no-store',
      },
    },
  );
};
