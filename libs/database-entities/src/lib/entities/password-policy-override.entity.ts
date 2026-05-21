// Per-role password policy override; nullable columns inherit from global singleton policy
// FEATURE: Password policy per-role overrides (admin only; machine/api-token are future slices)

import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum PasswordPolicyRole {
  ADMIN = 'admin',
}

export const PASSWORD_POLICY_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

@Entity()
export class PasswordPolicyOverride {
  @PrimaryColumn({ type: 'simple-enum', enum: PasswordPolicyRole })
  @ApiProperty({ description: 'Role this override applies to', enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  role!: PasswordPolicyRole;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Override minimum password length', example: 16, nullable: true, required: false })
  minLength!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Override maximum password length', example: 256, nullable: true, required: false })
  maxLength!: number | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override allow-all-unicode flag', nullable: true, required: false })
  allowAllUnicode!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override require-uppercase flag', nullable: true, required: false })
  requireUppercase!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override require-lowercase flag', nullable: true, required: false })
  requireLowercase!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override require-digit flag', nullable: true, required: false })
  requireDigit!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override require-special flag', nullable: true, required: false })
  requireSpecial!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override HIBP breach check flag', nullable: true, required: false })
  checkHIBP!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  @ApiProperty({ description: 'Override common-password rejection flag', nullable: true, required: false })
  checkCommonPasswords!: boolean | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Override minimum zxcvbn score (0-4)', example: 4, nullable: true, required: false })
  minZxcvbnScore!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Override password history size', example: 5, nullable: true, required: false })
  historySize!: number | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Override forced rotation interval in days', example: 90, nullable: true, required: false })
  rotationDays!: number | null;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the override row was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the override row was last updated' })
  updatedAt!: Date;

  @VersionColumn()
  @ApiProperty({ description: 'Row version for optimistic concurrency control', example: 1 })
  version!: number;
}
