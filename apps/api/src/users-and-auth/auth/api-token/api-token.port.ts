import type { ApiTokenChanges, ApiTokenPage, ApiTokenRecord, NewApiToken } from '@attraccess/application-models';

/** DI token for the {@link ApiTokenStore}. */
export const API_TOKEN_STORE = Symbol.for('attraccess.auth.api-token-store');

/** Where API tokens live. Only the hash of a token secret is ever stored. */
export interface ApiTokenStore {
  /** The not revoked tokens of a user, newest first. Page numbers start at 1. */
  listActive(userId: number, page: number, limit: number): Promise<ApiTokenPage>;
  /** Stores the token and its permissions in one atomic step. */
  create(token: NewApiToken): Promise<ApiTokenRecord>;
  /** The not revoked token of this user; null when the user owns no such token. */
  findActiveOwned(userId: number, tokenId: number): Promise<ApiTokenRecord | null>;
  /** The token whose secret hashes to this value, revoked or not. */
  findByHash(tokenHash: string): Promise<ApiTokenRecord | null>;
  /** Applies the changes (and replaces the permission set when given) in one atomic step. Null when the token is gone. */
  update(tokenId: number, changes: ApiTokenChanges): Promise<ApiTokenRecord | null>;
  revoke(tokenId: number, revokedAt: Date): Promise<void>;
  /**
   * Records a use, but only while the token is neither revoked nor expired at `usedAt`, decided in the same
   * statement. False when it was revoked or expired in the meantime.
   */
  touchLastUsed(tokenId: number, usedAt: Date): Promise<boolean>;
}
