import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// r14 : garde structurelle de l'ordre Hono dans routes/index.ts. Le chemin
// rapide get-session doit précéder le middleware global (sinon la double
// résolution revient), et tout le reste — pré-auth tRPC, /auth/* complet
// (OAuth/callbacks/sign-out), bearer — doit rester derrière le middleware.

const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

describe('ordre de routage /api (r14)', () => {
  const fastRoute = source.indexOf(".get('/auth/get-session'");
  const globalMiddleware = source.indexOf(".use('*', async (c, next) => {");
  const genericAuthRoute = source.indexOf("'/auth/*'");
  const mcpAuthorizeGuard = source.indexOf(".get('/auth/mcp/authorize'");
  const mcpTokenGuard = source.indexOf(".post('/auth/mcp/token'");
  const trpcMount = source.indexOf('trpcServer({');
  const preAuthResolution = source.indexOf(
    'await auth.api.getSession({ headers: c.req.raw.headers })',
  );
  const bearerFallback = source.indexOf("c.req.header('Authorization') && !session?.user");

  it('la route rapide get-session est enregistrée AVANT le middleware global', () => {
    expect(fastRoute).toBeGreaterThan(-1);
    expect(globalMiddleware).toBeGreaterThan(-1);
    expect(fastRoute).toBeLessThan(globalMiddleware);
  });

  it('la route générique /auth/* (OAuth, callbacks, sign-out) reste APRÈS le middleware complet', () => {
    expect(genericAuthRoute).toBeGreaterThan(globalMiddleware);
    expect(source).toContain(".on(['GET', 'POST', 'OPTIONS'], '/auth/*'");
  });

  it('les gardes MCP consent/token précèdent toujours le wildcard Better Auth', () => {
    expect(mcpAuthorizeGuard).toBeGreaterThan(globalMiddleware);
    expect(mcpTokenGuard).toBeGreaterThan(mcpAuthorizeGuard);
    expect(mcpAuthorizeGuard).toBeLessThan(genericAuthRoute);
    expect(mcpTokenGuard).toBeLessThan(genericAuthRoute);
    expect(source).toContain('handleMcpAuthorize(c.var.auth, c.req.raw)');
    expect(source).toContain('handleMcpToken(c.var.auth, c.req.raw)');
  });

  it('tRPC reste monté APRÈS le middleware : pré-auth inchangée', () => {
    expect(trpcMount).toBeGreaterThan(globalMiddleware);
  });

  it('la pré-résolution de session et le fallback bearer restent DANS le middleware global', () => {
    expect(preAuthResolution).toBeGreaterThan(globalMiddleware);
    expect(preAuthResolution).toBeLessThan(genericAuthRoute);
    expect(bearerFallback).toBeGreaterThan(globalMiddleware);
  });

  it('le chemin rapide délègue à handleGetSessionFast (une seule résolution, testée à part)', () => {
    expect(source).toContain('handleGetSessionFast(createAuth, c.req.raw)');
  });
});
