import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * A user's consent for one MCP client. It is the root of a refresh-token family: revoking it
 * invalidates every access and refresh token issued under it.
 */
@Entity('mcp_oauth_grant')
@Index(['userId'])
export class McpOAuthGrant {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'text' })
  clientId!: string;

  /** Permissions the user approved. The effective permissions are this list intersected with the user's current ones. */
  @Column({ type: 'jsonb' })
  permissionKeys!: string[];

  /** Canonical URL of the MCP resource the tokens are bound to (RFC 8707). */
  @Column({ type: 'text' })
  resource!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /** Absolute lifetime of the grant; refresh tokens cannot extend it. */
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;
}
