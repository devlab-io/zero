const MCP_REQUIRED_SCOPES = ['openid', 'profile', 'email'] as const;

function backendOrigin(backendUrl: string) {
  return new URL(backendUrl).origin;
}

export function buildMcpProtectedResourceMetadata(backendUrl: string) {
  const origin = backendOrigin(backendUrl);
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [...MCP_REQUIRED_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Reta Mail MCP',
  };
}

export function buildMcpAuthorizationChallenge(backendUrl: string) {
  const origin = backendOrigin(backendUrl);
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${MCP_REQUIRED_SCOPES.join(' ')}"`;
}

export function mcpUnauthorizedResponse(backendUrl: string) {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': buildMcpAuthorizationChallenge(backendUrl),
    },
  });
}
