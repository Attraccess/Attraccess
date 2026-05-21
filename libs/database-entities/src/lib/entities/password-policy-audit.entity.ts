// Append-only audit log for password policy admin mutations (global PATCH + per-role override CRUD)
// FEATURE: Password policy admin audit trail (DB-backed, queryable, retains actor + before/after diff)

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum PasswordPolicyAuditEvent {
  GLOBAL_POLICY_UPDATED = 'global_policy_updated',
  OVERRIDE_UPSERTED = 'override_upserted',
  OVERRIDE_DELETED = 'override_deleted',
}

@Entity()
export class PasswordPolicyAudit {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Auto-incremented audit row id', example: 42 })
  id!: number;

  @Index()
  @CreateDateColumn()
  @ApiProperty({ description: 'When the audited mutation happened' })
  at!: Date;

  @Column({ type: 'varchar', length: 64 })
  @ApiProperty({ description: 'Which mutation was performed', enum: PasswordPolicyAuditEvent, enumName: 'PasswordPolicyAuditEvent' })
  event!: PasswordPolicyAuditEvent;

  @Index()
  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'User id of the admin who performed the change', nullable: true, example: 1 })
  actorId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @ApiProperty({ description: 'Username snapshot at the time of the change', nullable: true, example: 'root' })
  actorUsername!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @ApiProperty({ description: 'Source IP address of the admin request', nullable: true, example: '203.0.113.4' })
  ip!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  @ApiProperty({ description: 'User-agent of the admin request', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @ApiProperty({ description: 'Optional request id for tracing', nullable: true })
  requestId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  @ApiProperty({ description: 'Role the change applied to (only set for override events)', nullable: true })
  role!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'JSON-encoded snapshot of the row before the change', nullable: true })
  before!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'JSON-encoded snapshot of the row after the change', nullable: true })
  after!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'JSON array of field names that changed', nullable: true })
  changedFields!: string | null;
}
