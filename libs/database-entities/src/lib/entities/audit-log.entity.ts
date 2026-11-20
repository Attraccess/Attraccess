import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AUTHENTICATION_METHODS, type AuthenticationMethod } from '@attraccess/application-models';

export { AUTHENTICATION_METHODS };
export type { AuthenticationMethod };

/**
 * Historical identifiers deliberately have no foreign keys or cascade relations.
 *
 * `details` is `json`, not `jsonb`: `json` keeps the text exactly as written, so the size check measures the same
 * compact JSON the application limits to 4096 bytes and the released SQLite schema checked. `jsonb` renders its text
 * with spaces after every `:` and `,` and writes numbers out in full (`1e+21` becomes 22 digits), so a payload both
 * accept could fail the check there and the audit row would be lost.
 */
@Entity('audit_log')
@Check('CHK_audit_log_details_size', 'octet_length("details"::text) <= 4096')
@Index('IDX_audit_log_at', ['at'])
@Index('IDX_audit_log_domain_id', ['domain', 'id'])
@Index('IDX_audit_log_actor_id', ['actorId', 'id'])
@Index('IDX_audit_log_subject_id', ['subjectId', 'subjectType', 'id'])
@Index('IDX_audit_log_operation_id', ['operationId', 'id'])
@Index('IDX_audit_log_domain_at', ['domain', 'at'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'varchar' })
  domain!: string;

  @Column({ type: 'varchar', nullable: true })
  pluginId!: string | null;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar' })
  operationId!: string;

  @Column({ type: 'integer', nullable: true })
  actorId!: number | null;

  @Column({ type: 'varchar', nullable: true })
  authenticationMethod!: AuthenticationMethod | null;

  @Column({ type: 'integer', nullable: true })
  apiTokenId!: number | null;

  @Column({ type: 'varchar' })
  outcome!: 'attempted' | 'succeeded' | 'failed';

  @Column({ type: 'varchar' })
  subjectType!: string;

  @Column({ type: 'bigint', nullable: true })
  subjectId!: number | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'json' })
  details!: Record<string, string | number | boolean | null>;
}
