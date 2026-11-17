import type {
  McpOAuthClientRecord,
  McpOAuthGrantRecord,
  McpOAuthTokenKind,
  McpOAuthTokenRecord,
  NewMcpOAuthClient,
  NewMcpOAuthGrant,
  NewMcpOAuthToken,
} from '@attraccess/application-models';

/** DI token for the {@link McpOAuthStore}. */
export const MCP_OAUTH_STORE = Symbol.for('attraccess.mcp.oauth-store');

/** Where the MCP authorization server keeps clients, grants and (hashed) tokens. */
export interface McpOAuthStore {
  findClient(clientId: string): Promise<McpOAuthClientRecord | null>;
  /**
   * Registers a client unless `limit` clients exist. At the limit, registrations that never obtained a grant and are
   * older than `staleBefore` are dropped first; null when the registry is still full afterwards.
   */
  registerClient(client: NewMcpOAuthClient, limit: number, staleBefore: Date): Promise<McpOAuthClientRecord | null>;

  createGrant(grant: NewMcpOAuthGrant): Promise<McpOAuthGrantRecord>;
  findGrant(grantId: string): Promise<McpOAuthGrantRecord | null>;
  /** Records a use of the grant. */
  touchGrant(grantId: string, usedAt: Date): Promise<void>;
  /** Ends a grant and drops every token issued under it, in one atomic step. */
  revokeGrant(grantId: string, revokedAt: Date): Promise<void>;

  insertToken(token: NewMcpOAuthToken): Promise<void>;
  findToken(tokenHash: string, kind: McpOAuthTokenKind): Promise<McpOAuthTokenRecord | null>;
  /**
   * Marks a single-use token as used, decided in one statement: of any number of concurrent callers (also on
   * other connections) exactly one gets true.
   */
  consumeToken(tokenHash: string, usedAt: Date): Promise<boolean>;

  /**
   * Drops unanswered authorization requests that expired before `requestsBefore`, and every token and grant that
   * expired before `othersBefore`.
   */
  purgeExpired(requestsBefore: Date, othersBefore: Date): Promise<void>;
}
