import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { McpOAuthGrantRecord, McpOAuthTokenKind, McpOAuthTokenRecord } from '@attraccess/application-models';
import type { AppConfigType } from '../config/app.config';
import { TokenHashService } from '../encryption/token-hash.service';
import {
  SESSION_USER_DIRECTORY,
  SessionUserDirectory,
} from '../users-and-auth/auth/session-store/session-user-directory.port';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import type { McpDelegation } from '../users-and-auth/strategies/mcp-delegation';
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  AUTHORIZATION_CODE_PREFIX,
  AUTHORIZATION_CODE_TTL_MS,
  AUTHORIZATION_REQUEST_PREFIX,
  AUTHORIZATION_REQUEST_TTL_MS,
  CODE_CHALLENGE_PATTERN,
  GRANT_LIFETIME_MS,
  MAX_STATE_LENGTH,
  REFRESH_TOKEN_PREFIX,
  StaticOAuthClient,
  isAllowedRedirectUri,
  isLoopbackRedirectUri,
  parseScope,
  parseStaticClients,
  randomSecret,
  verifyPkceS256,
} from './mcp-oauth-rules';
import { MCP_OAUTH_STORE, McpOAuthStore } from './mcp-oauth.port';

export type McpOAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'invalid_target'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'access_denied'
  | 'invalid_client_metadata'
  | 'invalid_redirect_uri'
  | 'not_found';

export class McpOAuthError extends Error {
  constructor(
    readonly code: McpOAuthErrorCode,
    description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

export interface AuthorizationParameters {
  clientId?: string;
  redirectUri?: string;
  responseType?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

interface RequestPayload extends Record<string, unknown> {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  permissionKeys: string[];
  resource: string;
}

interface CodePayload extends Record<string, unknown> {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface ConsentPermission {
  key: string;
  label: string;
  description: string;
  category: string;
}

export interface ConsentView {
  clientName: string;
  /** Pre-registered by the operator; otherwise the client registered itself and its name is unverified. */
  registeredByOperator: boolean;
  redirectUri: string;
  redirectHost: string;
  loopbackRedirect: boolean;
  /** Permissions the client asked for. Empty request = all of the user's current permissions. */
  permissions: ConsentPermission[];
  requestedAll: boolean;
  /** Requested permissions the user does not hold, which cannot be granted. */
  unavailablePermissions: string[];
  resource: string;
  expiresAt: Date;
}

type Registered = StaticOAuthClient & {
  /** Pre-registered by the operator in `MCP_OAUTH_CLIENTS`, as opposed to self-registered through DCR. */
  isStatic: boolean;
};

export interface AuthorizationRedirectError {
  redirectUri: string;
  state: string | null;
  error: McpOAuthErrorCode;
  description: string;
  /**
   * True when the browser may be sent to the redirect URI without the user looking at anything first: an operator
   * registered the client, or the URI is on the user's own device. Anyone can register a client for any https URI,
   * so for those an automatic error redirect would be an open redirector (RFC 9700, section 4.11.2).
   */
  trusted: boolean;
}

const MAX_REGISTERED_CLIENTS = 5000;
const PURGE_INTERVAL_MS = 10 * 60 * 1000;
/** Expired grants and tokens stay this long; unanswered authorization requests go as soon as they expire. */
const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;

/**
 * Authorization server for MCP clients: client registry, authorization requests and codes, grants with rotating
 * refresh tokens and audience-bound access tokens. Everything is persisted (hashed) in the database.
 */
@Injectable()
export class McpOAuthService {
  private readonly logger = new Logger(McpOAuthService.name);
  private readonly staticClients = new Map<string, Registered>();
  private lastPurgeAt = 0;

  constructor(
    config: ConfigService,
    private readonly rbac: RbacService,
    @Inject(MCP_OAUTH_STORE) private readonly oauthStore: McpOAuthStore,
    @Inject(SESSION_USER_DIRECTORY) private readonly users: SessionUserDirectory,
    private readonly tokenHash: TokenHashService,
  ) {
    try {
      for (const client of parseStaticClients(config.get<AppConfigType>('app')?.MCP_OAUTH_CLIENTS)) {
        this.staticClients.set(client.clientId, { ...client, isStatic: true });
      }
    } catch (error) {
      // A typo in an optional setting must never stop the application from starting.
      this.logger.error(`Ignoring MCP_OAUTH_CLIENTS: ${(error as Error).message}`);
    }
  }

  // --- clients ---------------------------------------------------------------------------------

  async findClient(clientId: string | undefined): Promise<Registered | null> {
    if (!clientId || clientId.length > 200) return null;
    const fixed = this.staticClients.get(clientId);
    if (fixed) return fixed;
    const stored = await this.oauthStore.findClient(clientId);
    return stored
      ? { clientId: stored.clientId, clientName: stored.clientName, redirectUris: stored.redirectUris, isStatic: false }
      : null;
  }

  /** Dynamic Client Registration (RFC 7591) for public clients. */
  async registerClient(metadata: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const redirectUris = metadata.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
      throw new McpOAuthError('invalid_redirect_uri', 'redirect_uris must list between 1 and 10 URIs');
    }
    if (!redirectUris.every(isAllowedRedirectUri)) {
      throw new McpOAuthError(
        'invalid_redirect_uri',
        'redirect_uris must be https URIs or loopback http URIs (localhost, 127.0.0.1, [::1]) without a fragment',
      );
    }
    const method = metadata.token_endpoint_auth_method ?? 'none';
    if (method !== 'none') {
      throw new McpOAuthError(
        'invalid_client_metadata',
        'Only public clients are supported: token_endpoint_auth_method must be "none"',
      );
    }
    const grantTypes = metadata.grant_types ?? ['authorization_code'];
    if (
      !Array.isArray(grantTypes) ||
      !grantTypes.every((type) => type === 'authorization_code' || type === 'refresh_token')
    ) {
      throw new McpOAuthError('invalid_client_metadata', 'grant_types must be authorization_code and/or refresh_token');
    }
    const responseTypes = metadata.response_types ?? ['code'];
    if (!Array.isArray(responseTypes) || !responseTypes.every((type) => type === 'code')) {
      throw new McpOAuthError('invalid_client_metadata', 'response_types must be ["code"]');
    }
    const rawName = metadata.client_name;
    if (rawName !== undefined && typeof rawName !== 'string') {
      throw new McpOAuthError('invalid_client_metadata', 'client_name must be a string');
    }
    // Control and format characters (bidi overrides, zero-width) would let a client spoof the consent screen.
    const clientName =
      ((rawName as string | undefined) ?? '')
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .trim()
        .slice(0, 120) || 'MCP client';
    void this.purgeExpired();
    const client = await this.oauthStore.registerClient(
      {
        clientId: randomUUID(),
        clientName,
        redirectUris: [...new Set(redirectUris)],
        registeredIp: ip,
      },
      MAX_REGISTERED_CLIENTS,
      // Drops registrations that never obtained a grant and are older than a day.
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    if (!client) throw new McpOAuthError('invalid_client_metadata', 'Too many registered clients', 503);
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  }

  // --- authorization request -------------------------------------------------------------------

  /**
   * Validates an authorization request. Returns an opaque request id for the consent page. A problem with the client or
   * redirect URI throws `McpOAuthError` (shown as an error page, never redirected); any other problem is returned as
   * `{ redirectError }` for the now-verified redirect URI.
   */
  async startAuthorization(
    params: AuthorizationParameters,
    resource: string,
  ): Promise<{ requestId: string } | { redirectError: AuthorizationRedirectError }> {
    const client = await this.findClient(params.clientId);
    if (!client) throw new McpOAuthError('invalid_client', 'Unknown client_id');
    // Exact match. From here on only the registered value is used, never the one that came with the request.
    const redirectUri = client.redirectUris.find((registered) => registered === params.redirectUri);
    if (!redirectUri) {
      throw new McpOAuthError('invalid_request', 'redirect_uri does not match a registered redirect URI');
    }
    const trusted = client.isStatic || isLoopbackRedirectUri(redirectUri);
    const oversizedState = params.state !== undefined && params.state.length > MAX_STATE_LENGTH;
    // An over-long state is not echoed back; it is dropped so that the error still reaches the client.
    const state = oversizedState ? null : (params.state ?? null);
    const fail = (error: McpOAuthErrorCode, description: string) => ({
      redirectError: { redirectUri, state, error, description, trusted },
    });
    if (oversizedState) return fail('invalid_request', `state must not exceed ${MAX_STATE_LENGTH} characters`);
    if (params.responseType !== 'code') return fail('unsupported_response_type', 'response_type must be "code"');
    if (!params.codeChallenge || !CODE_CHALLENGE_PATTERN.test(params.codeChallenge)) {
      return fail('invalid_request', 'A PKCE code_challenge is required');
    }
    if (params.codeChallengeMethod !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256');
    if (params.resource !== resource) {
      return fail('invalid_target', `resource must be ${resource}`);
    }
    const permissionKeys = parseScope(params.scope);
    if (permissionKeys.length) {
      const known = new Set((await this.rbac.getPermissions()).map((permission) => permission.key));
      const unknown = permissionKeys.filter((key) => !known.has(key));
      if (unknown.length) return fail('invalid_scope', `Unknown permissions: ${unknown.join(' ')}`);
    }
    const payload: RequestPayload = {
      clientId: client.clientId,
      redirectUri,
      codeChallenge: params.codeChallenge,
      state,
      permissionKeys,
      resource,
    };
    const requestId = randomSecret(AUTHORIZATION_REQUEST_PREFIX);
    await this.store('request', requestId, payload, AUTHORIZATION_REQUEST_TTL_MS);
    void this.purgeExpired();
    return { requestId };
  }

  async describeRequest(requestId: string, user: { id: number }): Promise<ConsentView> {
    const { payload, token } = await this.loadRequest(requestId);
    const client = await this.findClient(payload.clientId);
    if (!client) throw new McpOAuthError('invalid_client', 'Unknown client_id');
    const current = await this.rbac.getEffectivePermissions(user.id, true);
    const requestedAll = payload.permissionKeys.length === 0;
    const keys = requestedAll ? [...current].sort() : payload.permissionKeys;
    // The consent page cannot read the permission catalog itself: listing it needs an administrator permission.
    const catalog = new Map((await this.rbac.getPermissions()).map((permission) => [permission.key, permission]));
    const permissions = keys.map((key) => {
      const known = catalog.get(key);
      return {
        key,
        label: known?.label ?? key,
        description: known?.description ?? '',
        category: known?.category ?? '',
      };
    });
    return {
      clientName: client.clientName,
      registeredByOperator: client.isStatic,
      redirectUri: payload.redirectUri,
      redirectHost: new URL(payload.redirectUri).host,
      loopbackRedirect: isLoopbackRedirectUri(payload.redirectUri),
      permissions,
      requestedAll,
      unavailablePermissions: keys.filter((permission) => !current.has(permission)),
      resource: payload.resource,
      expiresAt: token.expiresAt,
    };
  }

  /** Consent granted: returns the redirect carrying a single-use authorization code. */
  async approve(requestId: string, user: { id: number }, issuer: string): Promise<{ redirectUrl: string }> {
    const { payload } = await this.consumeRequest(requestId);
    const current = await this.rbac.getEffectivePermissions(user.id, true);
    const requested = payload.permissionKeys.length ? payload.permissionKeys : [...current].sort();
    if (requested.some((permission) => !current.has(permission))) {
      return {
        redirectUrl: this.redirect(payload, issuer, {
          error: 'invalid_scope',
          error_description: 'Requested permissions exceed those of the user',
        }),
      };
    }
    const grant = await this.oauthStore.createGrant({
      id: randomUUID(),
      userId: user.id,
      clientId: payload.clientId,
      permissionKeys: requested,
      resource: payload.resource,
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS),
    });
    const code = randomSecret(AUTHORIZATION_CODE_PREFIX);
    const codePayload: CodePayload = {
      clientId: payload.clientId,
      redirectUri: payload.redirectUri,
      codeChallenge: payload.codeChallenge,
      resource: payload.resource,
    };
    await this.store('code', code, codePayload, AUTHORIZATION_CODE_TTL_MS, grant.id);
    return { redirectUrl: this.redirect(payload, issuer, { code }) };
  }

  async deny(requestId: string, issuer: string): Promise<{ redirectUrl: string }> {
    const { payload } = await this.consumeRequest(requestId);
    return {
      redirectUrl: this.redirect(payload, issuer, {
        error: 'access_denied',
        error_description: 'The user denied the request',
      }),
    };
  }

  buildErrorRedirect(error: AuthorizationRedirectError, issuer: string): string {
    return this.redirect(error, issuer, { error: error.error, error_description: error.description });
  }

  private redirect(
    target: { redirectUri: string; state: string | null },
    issuer: string,
    parameters: Record<string, string>,
  ): string {
    const url = new URL(target.redirectUri);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    if (target.state !== null) url.searchParams.set('state', target.state);
    url.searchParams.set('iss', issuer);
    return url.toString();
  }

  // --- token endpoint --------------------------------------------------------------------------

  async exchangeCode(
    input: { clientId?: string; code?: string; redirectUri?: string; codeVerifier?: string; resource?: string },
    resource: string,
  ): Promise<TokenResponse> {
    if (!input.code || !input.clientId || !input.redirectUri || !input.codeVerifier) {
      throw new McpOAuthError('invalid_request', 'client_id, code, redirect_uri and code_verifier are required');
    }
    if (input.resource !== resource) throw new McpOAuthError('invalid_target', `resource must be ${resource}`);
    const row = await this.oauthStore.findToken(this.hash(input.code), 'code');
    if (!row?.grantId) throw new McpOAuthError('invalid_grant', 'Invalid authorization code');
    const consumed = await this.consume(row.tokenHash);
    if (!consumed) {
      // A code presented twice means it may have leaked: end the grant and everything issued under it.
      await this.revokeGrant(row.grantId);
      throw new McpOAuthError('invalid_grant', 'Authorization code was already used');
    }
    const payload = row.payload as CodePayload | null;
    const grant = await this.oauthStore.findGrant(row.grantId);
    if (
      !payload ||
      !grant ||
      !(await this.findClient(payload.clientId)) ||
      row.expiresAt <= new Date() ||
      payload.clientId !== input.clientId ||
      payload.redirectUri !== input.redirectUri ||
      payload.resource !== resource ||
      !verifyPkceS256(input.codeVerifier, payload.codeChallenge)
    ) {
      throw new McpOAuthError('invalid_grant', 'The authorization code, redirect_uri or code_verifier is invalid');
    }
    return this.issueTokens(grant);
  }

  async refresh(
    input: { clientId?: string; refreshToken?: string; resource?: string },
    resource: string,
  ): Promise<TokenResponse> {
    if (!input.refreshToken || !input.clientId) {
      throw new McpOAuthError('invalid_request', 'client_id and refresh_token are required');
    }
    // RFC 8707 on every token request, refreshes included, so no token is ever minted for another audience.
    if (input.resource !== resource) throw new McpOAuthError('invalid_target', `resource must be ${resource}`);
    const row = await this.oauthStore.findToken(this.hash(input.refreshToken), 'refresh');
    if (!row?.grantId) throw new McpOAuthError('invalid_grant', 'Invalid refresh token');
    const grant = await this.oauthStore.findGrant(row.grantId);
    if (
      !grant ||
      grant.revokedAt ||
      grant.expiresAt <= new Date() ||
      grant.clientId !== input.clientId ||
      grant.resource !== resource
    ) {
      throw new McpOAuthError('invalid_grant', 'The grant is no longer valid');
    }
    const user = await this.users.findSessionUser(grant.userId);
    // The owner was deleted or disabled, or the operator removed the client from MCP_OAUTH_CLIENTS: nothing this grant
    // issues should be accepted any more, so end it instead of rotating.
    if (!user || user.isDisabled || !(await this.findClient(grant.clientId))) {
      await this.revokeGrant(grant.id);
      throw new McpOAuthError('invalid_grant', 'The grant is no longer valid');
    }
    if (!(await this.consume(row.tokenHash))) {
      // The token was already rotated: someone holds a stale copy. Revoke the whole family.
      await this.revokeGrant(grant.id);
      this.logger.warn(`Refresh token reuse detected; revoked MCP OAuth grant ${grant.id} of user ${grant.userId}`);
      throw new McpOAuthError('invalid_grant', 'Refresh token was already used');
    }
    if (row.expiresAt <= new Date()) throw new McpOAuthError('invalid_grant', 'Refresh token expired');
    return this.issueTokens(grant);
  }

  private async issueTokens(grant: McpOAuthGrantRecord): Promise<TokenResponse> {
    const accessToken = randomSecret(ACCESS_TOKEN_PREFIX);
    const refreshToken = randomSecret(REFRESH_TOKEN_PREFIX);
    const now = Date.now();
    await this.store('access', accessToken, null, ACCESS_TOKEN_TTL_MS, grant.id);
    await this.store('refresh', refreshToken, null, Math.max(0, grant.expiresAt.getTime() - now), grant.id);
    void this.purgeExpired();
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: grant.permissionKeys.join(' '),
    };
  }

  // --- resource server -------------------------------------------------------------------------

  /** Resolves an MCP access token for the given audience, or `null`. Never throws for an unknown token. */
  async authenticateAccessToken(token: string, resource: string): Promise<McpDelegation | null> {
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null;
    const row = await this.oauthStore.findToken(this.hash(token), 'access');
    if (!row?.grantId || row.expiresAt <= new Date()) return null;
    const grant = await this.oauthStore.findGrant(row.grantId);
    if (!grant || grant.revokedAt || grant.expiresAt <= new Date()) return null;
    // Audience binding: a token issued for another resource is never accepted here.
    if (grant.resource !== resource) return null;
    const user = await this.users.findSessionUser(grant.userId);
    if (!user || user.isDisabled) return null;
    if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS) {
      await this.oauthStore.touchGrant(grant.id, new Date());
    }
    return { user, permissionKeys: grant.permissionKeys, grantId: grant.id, clientId: grant.clientId };
  }

  async revokeGrant(grantId: string): Promise<void> {
    await this.oauthStore.revokeGrant(grantId, new Date());
  }

  // --- storage helpers -------------------------------------------------------------------------

  private hash(secret: string): string {
    return this.tokenHash.hashMcpToken(secret);
  }

  private async store(
    kind: McpOAuthTokenKind,
    secret: string,
    payload: Record<string, unknown> | null,
    ttlMs: number,
    grantId: string | null = null,
  ): Promise<void> {
    await this.oauthStore.insertToken({
      tokenHash: this.hash(secret),
      kind,
      grantId,
      payload,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  }

  /** Atomically marks a single-use value as used. False when somebody else already did. */
  private async consume(tokenHash: string): Promise<boolean> {
    return this.oauthStore.consumeToken(tokenHash, new Date());
  }

  private async loadRequest(requestId: string): Promise<{ payload: RequestPayload; token: McpOAuthTokenRecord }> {
    const token = await this.oauthStore.findToken(this.hash(requestId), 'request');
    if (!token?.payload || token.usedAt || token.expiresAt <= new Date()) {
      throw new McpOAuthError('not_found', 'This authorization request has expired or was already answered', 404);
    }
    return { payload: token.payload as RequestPayload, token };
  }

  private async consumeRequest(requestId: string): Promise<{ payload: RequestPayload }> {
    const { payload, token } = await this.loadRequest(requestId);
    if (!(await this.consume(token.tokenHash))) {
      throw new McpOAuthError('not_found', 'This authorization request was already answered', 404);
    }
    return { payload };
  }

  private async purgeExpired(): Promise<void> {
    if (Date.now() - this.lastPurgeAt < PURGE_INTERVAL_MS) return;
    this.lastPurgeAt = Date.now();
    try {
      const now = Date.now();
      // Anyone can open an authorization request, so unanswered ones must not pile up.
      await this.oauthStore.purgeExpired(new Date(now), new Date(now - PURGE_GRACE_MS));
    } catch (error) {
      this.logger.warn(`Could not purge expired MCP OAuth data: ${(error as Error).message}`);
    }
  }
}
