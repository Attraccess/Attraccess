import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import express, { Request, Response, Router } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { signMcpDelegation } from './mcp-delegation';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

type RegisteredClient = { client_id: string; redirect_uris: string[]; client_name?: string };
type OAuthToken = {
  typ: 'consent' | 'code' | 'access' | 'refresh';
  clientId: string;
  audience: string;
  permissions: string[];
  exp: number;
  session?: string;
  userId?: number;
  redirectUri?: string;
  codeChallenge?: string;
  state?: string;
};
type OAuthRequest = Request & { mcpOAuth?: boolean; mcpApplicationToken?: string; user?: { id: number; username?: string; effectivePermissions?: Set<string> } };

const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

function encrypt(secret: string, payload: OAuthToken): string {
  const iv = randomBytes(12);
  const key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return `mcp1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(secret: string, token: string): OAuthToken | null {
  const [prefix, ivText, tagText, encryptedText, extra] = token.split('.');
  if (prefix !== 'mcp1' || !ivText || !tagText || !encryptedText || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const json = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
    const value = JSON.parse(json) as OAuthToken;
    if (!['consent', 'code', 'access', 'refresh'].includes(value.typ) || !Number.isSafeInteger(value.exp) || value.exp <= Date.now()) return null;
    if (
      typeof value.clientId !== 'string' || typeof value.audience !== 'string' || !Array.isArray(value.permissions) ||
      value.permissions.some((permission) => typeof permission !== 'string')
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function parseClients(raw?: string): RegisteredClient[] {
  if (!raw) return [];
  const clients = JSON.parse(raw) as unknown;
  if (!Array.isArray(clients)) throw new Error('MCP_OAUTH_CLIENTS must be a JSON array');
  const ids = new Set<string>();
  return clients.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid MCP OAuth client registration');
    const client = value as RegisteredClient;
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(client.client_id) || ids.has(client.client_id)) throw new Error('Invalid or duplicate MCP OAuth client_id');
    if (!Array.isArray(client.redirect_uris) || client.redirect_uris.length === 0) throw new Error(`MCP OAuth client ${client.client_id} needs redirect_uris`);
    for (const uri of client.redirect_uris) {
      const parsed = new URL(uri);
      if (parsed.hash || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) {
        throw new Error(`MCP OAuth redirect URI must use HTTPS or localhost: ${uri}`);
      }
    }
    ids.add(client.client_id);
    return client;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function formString(request: Request, name: string): string {
  const value = (request.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : '';
}

function requestedPermissions(raw: string, available: Set<string>): string[] | null {
  const requested = raw.trim() ? [...new Set(raw.trim().split(/\s+/))] : [...available];
  return requested.every((permission) => available.has(permission)) ? requested.sort() : null;
}

function validPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

function respondToken(response: Response, body: Record<string, unknown>): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.json(body);
}

/** OAuth 2.1 authorization code flow. Public clients are registered through MCP_OAUTH_CLIENTS. */
export function registerMcpOAuthEndpoints(
  app: NestExpressApplication,
  options: {
    resourceUrl: string;
    secret: string;
    clientsJson?: string;
    prefix: string;
    sessions: SessionService;
    rbac: RbacService;
    sessionStrategy: SessionStrategy;
  },
): (request: OAuthRequest) => Promise<void> {
  const clients = parseClients(options.clientsJson);
  const issuer = new URL('/', options.resourceUrl).origin;
  const authorizeUrl = `${issuer}${options.prefix}/oauth/authorize`;
  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  function authorizeParams(input: Record<string, unknown>): { client: RegisteredClient; redirectUri: string; state: string; challenge: string; permissions: string[] } | null {
    const client = clients.find((candidate) => candidate.client_id === input.client_id);
    const redirectUri = input.redirect_uri;
    const state = input.state;
    const challenge = input.code_challenge;
    if (
      input.response_type !== 'code' || !client || typeof redirectUri !== 'string' || !client.redirect_uris.includes(redirectUri) ||
      typeof state !== 'string' || state.length < 1 || state.length > 1024 || typeof challenge !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge) || input.code_challenge_method !== 'S256' || input.resource !== options.resourceUrl
    ) return null;
    const permissions = typeof input.scope === 'string' ? input.scope : '';
    return { client, redirectUri, state, challenge, permissions: permissions ? permissions.split(/\s+/) : [] };
  }

  async function authenticatedUser(request: Request) {
    const sessionToken = request.cookies?.['auth-session'];
    if (!sessionToken) return null;
    const authorization = request.headers.authorization;
    delete request.headers.authorization;
    try {
      return await options.sessionStrategy.validate(request);
    } finally {
      if (authorization !== undefined) request.headers.authorization = authorization;
    }
  }

  router.get('/authorize', async (request: Request, response: Response) => {
    const params = authorizeParams(request.query as Record<string, unknown>);
    if (!params) {
      response.status(400).send('Invalid OAuth authorization request');
      return;
    }
    const user = await authenticatedUser(request);
    if (!user) {
      response.status(401).send('Sign in to Attraccess in this browser, then restart authorization.');
      return;
    }
    const current = await options.rbac.getEffectivePermissions(user.id, true);
    const permissions = params.permissions.length ? requestedPermissions(params.permissions.join(' '), current) : [...current].sort();
    if (!permissions) {
      response.status(403).send('The requested permissions exceed your current effective permissions.');
      return;
    }
    const consent = encrypt(options.secret, {
      typ: 'consent', clientId: params.client.client_id, audience: options.resourceUrl, permissions,
      exp: Date.now() + 10 * 60_000, userId: user.id, redirectUri: params.redirectUri,
      codeChallenge: params.challenge, state: params.state,
    });
    const permissionList = permissions.map((permission) => `<li>${escapeHtml(permission)}</li>`).join('');
    response.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Authorize Attraccess MCP</title></head><body><main><h1>Authorize ${escapeHtml(params.client.client_name ?? params.client.client_id)}</h1><p>Signed in as ${escapeHtml(user.username ?? String(user.id))}</p><p>This client requests these permissions:</p><ul>${permissionList}</ul><form method="post" action="${escapeHtml(authorizeUrl)}"><input type="hidden" name="consent" value="${escapeHtml(consent)}"><button name="decision" value="approve">Approve</button><button name="decision" value="deny">Deny</button></form></main></body></html>`);
  });

  router.post('/authorize', async (request: Request, response: Response) => {
    const consent = decrypt(options.secret, formString(request, 'consent'));
    const user = await authenticatedUser(request);
    if (!consent || consent.typ !== 'consent' || !consent.userId || !consent.redirectUri || !consent.codeChallenge || !consent.state || !user || user.id !== consent.userId) {
      response.status(400).send('Authorization consent expired or invalid');
      return;
    }
    const redirectUri = consent.redirectUri;
    const challenge = consent.codeChallenge;
    const state = consent.state;
    const client = clients.find((candidate) => candidate.client_id === consent.clientId && candidate.redirect_uris.includes(redirectUri));
    if (!client) {
      response.status(400).send('OAuth client registration changed; restart authorization');
      return;
    }
    const current = await options.rbac.getEffectivePermissions(user.id, true);
    const permissions = consent.permissions.filter((permission) => current.has(permission));
    if (formString(request, 'decision') !== 'approve') {
      const denied = new URL(consent.redirectUri);
      denied.searchParams.set('error', 'access_denied');
      denied.searchParams.set('state', state);
      response.redirect(302, denied.toString());
      return;
    }
    const codeSession = await options.sessions.createSession(user, { expiresIn: 120, userAgent: 'MCP OAuth authorization code' });
    const code = encrypt(options.secret, {
      typ: 'code', clientId: consent.clientId, audience: consent.audience, permissions,
      exp: Date.now() + 120_000, session: codeSession, userId: user.id, redirectUri: consent.redirectUri, codeChallenge: challenge,
    });
    const redirect = new URL(consent.redirectUri);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', state);
    response.redirect(302, redirect.toString());
  });

  router.post('/token', async (request: Request, response: Response) => {
    const grantType = formString(request, 'grant_type');
    const clientId = formString(request, 'client_id');
    const resource = formString(request, 'resource');
    if (resource !== options.resourceUrl || !clients.some((client) => client.client_id === clientId)) {
      respondToken(response.status(400), { error: 'invalid_client' });
      return;
    }
    if (grantType === 'authorization_code') {
      const grant = decrypt(options.secret, formString(request, 'code'));
      const verifier = formString(request, 'code_verifier');
      if (
        !grant || grant.typ !== 'code' || grant.clientId !== clientId || grant.audience !== resource ||
        grant.redirectUri !== formString(request, 'redirect_uri') || !grant.session || !grant.codeChallenge ||
        !validPkce(verifier, grant.codeChallenge)
      ) {
        respondToken(response.status(400), { error: 'invalid_grant' });
        return;
      }
      const user = await options.sessions.validateSession(grant.session);
      if (!user || !(await options.sessions.consumeSession(grant.session))) {
        respondToken(response.status(400), { error: 'invalid_grant' });
        return;
      }
      await issueTokens(response, user, clientId, resource, grant.permissions, Date.now() + REFRESH_TTL_SECONDS * 1000);
      return;
    }
    if (grantType === 'refresh_token') {
      const grant = decrypt(options.secret, formString(request, 'refresh_token'));
      if (!grant || grant.typ !== 'refresh' || grant.clientId !== clientId || grant.audience !== resource || !grant.session) {
        respondToken(response.status(400), { error: 'invalid_grant' });
        return;
      }
      const user = await options.sessions.validateSession(grant.session);
      if (!user || !(await options.sessions.consumeSession(grant.session))) {
        respondToken(response.status(400), { error: 'invalid_grant' });
        return;
      }
      const current = await options.rbac.getEffectivePermissions(user.id, true);
      const permissions = grant.permissions.filter((permission) => current.has(permission));
      await issueTokens(response, user, clientId, resource, permissions, grant.exp);
      return;
    }
    respondToken(response.status(400), { error: 'unsupported_grant_type' });
  });

  async function issueTokens(response: Response, user: NonNullable<Awaited<ReturnType<SessionService['validateSession']>>>, clientId: string, audience: string, permissions: string[], refreshExpiresAt: number) {
    const current = await options.rbac.getEffectivePermissions(user.id, true);
    const effective = permissions.filter((permission) => current.has(permission)).sort();
    const accessSession = await options.sessions.createSession(user, { expiresIn: ACCESS_TTL_SECONDS, userAgent: 'MCP OAuth access' });
    const refreshRemaining = Math.max(1, Math.floor((refreshExpiresAt - Date.now()) / 1000));
    const refreshSession = await options.sessions.createSession(user, { expiresIn: refreshRemaining, userAgent: 'MCP OAuth refresh' });
    respondToken(response, {
      access_token: encrypt(options.secret, { typ: 'access', clientId, audience, permissions: effective, exp: Date.now() + ACCESS_TTL_SECONDS * 1000, session: accessSession, userId: user.id }),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: encrypt(options.secret, { typ: 'refresh', clientId, audience, permissions: effective, exp: refreshExpiresAt, session: refreshSession, userId: user.id }),
      scope: effective.join(' '),
    });
  }

  app.use(options.prefix + '/oauth', router);
  return async (request: OAuthRequest) => {
    const authorization = request.header('authorization') ?? '';
    const match = authorization.match(/^Bearer\s+(mcp1\.[^\s]+)$/i);
    if (!match) {
      request.user = await options.sessionStrategy.validate(request);
      return;
    }
    const token = decrypt(options.secret, match[1]);
    if (!token || token.typ !== 'access' || token.audience !== options.resourceUrl || !token.session || !token.userId) {
      throw new Error('Invalid MCP OAuth access token or resource audience');
    }
    request.headers.authorization = `Bearer ${token.session}`;
    request.headers['x-mcp-delegation'] = signMcpDelegation(options.secret, {
      userId: token.userId, permissions: token.permissions, expiresAt: Date.now() + 60_000,
    });
    const user = await options.sessionStrategy.validate(request);
    if (user.id !== token.userId) throw new Error('OAuth token principal no longer matches its session');
    const current = await options.rbac.getEffectivePermissions(user.id, true);
    const authenticatedUser = user as AuthenticatedUser;
    authenticatedUser.effectivePermissions = new Set(token.permissions.filter((permission) => current.has(permission)));
    request.headers['x-mcp-delegation'] = signMcpDelegation(options.secret, {
      userId: authenticatedUser.id,
      permissions: [...(authenticatedUser.effectivePermissions ?? [])],
      expiresAt: Date.now() + 60_000,
    });
    request.user = authenticatedUser;
    request.mcpOAuth = true;
    request.mcpApplicationToken = token.session;
  };
}

export function mcpOAuthAuthorizationServerMetadata(issuer: string, prefix: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}${prefix}/oauth/authorize`,
    token_endpoint: `${issuer}${prefix}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}
