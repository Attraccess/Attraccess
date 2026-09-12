import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Historical identifiers deliberately have no foreign keys or cascade relations. */
@Entity('audit_log')
@Index('IDX_audit_log_at', ['at'])
@Index('IDX_audit_log_domain_id', ['domain', 'id'])
@Index('IDX_audit_log_actor_id', ['actorId', 'id'])
@Index('IDX_audit_log_subject_id', ['subjectId', 'subjectType', 'id'])
@Index('IDX_audit_log_operation_id', ['operationId', 'id'])
@Index('IDX_audit_log_domain_at', ['domain', 'at'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'datetime' })
  at!: Date;

  @Column({ type: 'varchar' })
  domain!: string;

  @Column({ type: 'varchar' })
  pluginId!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar' })
  operationId!: string;

  @Column({ type: 'integer' })
  actorId!: number;

  @Column({ type: 'varchar' })
  authenticationMethod!: 'session' | 'api-token';

  @Column({ type: 'integer', nullable: true })
  apiTokenId!: number | null;

  @Column({ type: 'varchar' })
  outcome!: 'attempted' | 'succeeded' | 'failed';

  @Column({ type: 'varchar' })
  subjectType!: string;

  @Column({ type: 'integer' })
  subjectId!: number;

  @Column({ type: 'simple-json' })
  details!: Record<string, string | number>;
}
