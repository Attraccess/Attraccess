import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** A public OAuth client registered through Dynamic Client Registration (RFC 7591). */
@Entity('mcp_oauth_client')
export class McpOAuthClient {
  @PrimaryColumn({ type: 'text' })
  clientId!: string;

  @Column({ type: 'text' })
  clientName!: string;

  @Column({ type: 'jsonb' })
  redirectUris!: string[];

  @Column({ type: 'text', nullable: true })
  registeredIp!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
