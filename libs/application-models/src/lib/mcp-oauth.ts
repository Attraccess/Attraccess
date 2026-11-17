export type McpOAuthTokenKind = 'request' | 'code' | 'access' | 'refresh';

/** A public OAuth client that registered itself through Dynamic Client Registration (RFC 7591). */
export interface McpOAuthClientRecord {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  registeredIp: string | null;
  createdAt: Date;
}

export type NewMcpOAuthClient = Pick<McpOAuthClientRecord, 'clientId' | 'clientName' | 'redirectUris' | 'registeredIp'>;

/** A user's consent for one MCP client; the root of a refresh-token family. */
export interface McpOAuthGrantRecord {
  id: string;
  userId: number;
  clientId: string;
  /** Permissions the user approved; the effective ones are these intersected with the user's current ones. */
  permissionKeys: string[];
  /** Canonical URL of the MCP resource the tokens are bound to (RFC 8707). */
  resource: string;
  createdAt: Date;
  /** Absolute lifetime of the grant; refresh tokens cannot extend it. */
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export type NewMcpOAuthGrant = Pick<
  McpOAuthGrantRecord,
  'id' | 'userId' | 'clientId' | 'permissionKeys' | 'resource' | 'expiresAt'
>;

/** A pending authorization request, authorization code, access token or refresh token. Only the hash is stored. */
export interface McpOAuthTokenRecord {
  tokenHash: string;
  kind: McpOAuthTokenKind;
  grantId: string | null;
  /** Request and code parameters (client, redirect URI, PKCE challenge, state, scope, resource). */
  payload: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date;
  /** Set when a single-use value (request, code, refresh token) has been consumed. */
  usedAt: Date | null;
}

export type NewMcpOAuthToken = Pick<McpOAuthTokenRecord, 'tokenHash' | 'kind' | 'grantId' | 'payload' | 'expiresAt'>;
