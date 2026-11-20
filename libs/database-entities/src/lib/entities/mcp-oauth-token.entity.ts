import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryColumn } from 'typeorm';
import type { McpOAuthTokenKind } from '@attraccess/application-models';
import { McpOAuthGrant } from './mcp-oauth-grant.entity';

export type { McpOAuthTokenKind };

/**
 * Pending authorization requests, authorization codes, access tokens and refresh tokens.
 * Only the SHA-256 of the secret value is stored.
 */
@Entity('mcp_oauth_token')
@Index(['grantId'])
@Index(['expiresAt'])
export class McpOAuthToken {
  @PrimaryColumn({ type: 'text' })
  tokenHash!: string;

  @Column({ type: 'text' })
  kind!: McpOAuthTokenKind;

  @Column({ type: 'text', nullable: true })
  grantId!: string | null;

  /** Request and code parameters (client, redirect URI, PKCE challenge, state, scope, resource). */
  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /** Set when a single-use value (request, code, refresh token) has been consumed. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @ManyToOne(() => McpOAuthGrant, { onDelete: 'CASCADE', nullable: true })
  grant!: McpOAuthGrant | null;
}
