import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export const PASSWORD_POLICY_SINGLETON_ID = 1;

@Entity()
export class PasswordPolicy {
  @PrimaryColumn({ type: 'integer' })
  @ApiProperty({ description: 'Singleton row identifier', example: PASSWORD_POLICY_SINGLETON_ID })
  id!: number;

  @Column({ type: 'integer', default: 12 })
  @ApiProperty({ description: 'Minimum allowed password length', example: 12 })
  minLength!: number;

  @Column({ type: 'integer', default: 128 })
  @ApiProperty({ description: 'Maximum allowed password length', example: 128 })
  maxLength!: number;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Whether all Unicode characters are allowed', example: true })
  allowAllUnicode!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether at least one uppercase letter is required', example: false })
  requireUppercase!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether at least one lowercase letter is required', example: false })
  requireLowercase!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether at least one digit is required', example: false })
  requireDigit!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether at least one special character is required', example: false })
  requireSpecial!: boolean;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Whether to check the password against the HIBP breach corpus', example: true })
  checkHIBP!: boolean;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Whether to reject common passwords (top-10k list)', example: true })
  checkCommonPasswords!: boolean;

  @Column({ type: 'integer', default: 3 })
  @ApiProperty({ description: 'Minimum required zxcvbn score (0-4)', example: 3 })
  minZxcvbnScore!: number;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'How many previous passwords to remember (0 disables)', example: 0 })
  historySize!: number;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'Forced rotation interval in days (0 disables)', example: 0 })
  rotationDays!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the policy record was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the policy record was last updated' })
  updatedAt!: Date;

  @VersionColumn()
  @ApiProperty({ description: 'Row version for optimistic concurrency control', example: 1 })
  version!: number;
}
