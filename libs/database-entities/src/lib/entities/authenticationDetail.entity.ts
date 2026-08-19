import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';
import { AuthenticationType } from '../types/authenticationType.enum';
import { SSOProviderType } from './ssoProvider.entity';

@Entity()
@Index(['userId', 'type'], { unique: true })
@Index(['providerType', 'providerId', 'ssoSubject'], { unique: true, where: '"providerType" IS NOT NULL AND "providerId" IS NOT NULL AND "ssoSubject" IS NOT NULL' })
@Index('IDX_authentication_detail_guest_otp_secret_hash', ['totpSecretHash'], {
  unique: true,
  where: '"type" = \'guest_otp\' AND "totpSecretHash" IS NOT NULL',
})
export class AuthenticationDetail {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the authentication detail',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user',
    example: 1,
  })
  userId!: number;

  @Column({
    type: 'simple-enum',
    enum: AuthenticationType,
  })
  @ApiProperty({
    description: 'The type of authentication',
    enum: AuthenticationType,
    example: AuthenticationType.LOCAL_PASSWORD,
    enumName: 'AuthenticationType',
  })
  type!: AuthenticationType;

  @Column({ nullable: true, type: 'text' })
  @Exclude()
  @ApiProperty({
    description: 'The hashed password (for local authentication)',
    required: false,
  })
  password?: string;

  @Column({
    type: 'simple-enum',
    enum: SSOProviderType,
    nullable: true,
  })
  @ApiProperty({
    description: 'The SSO provider type (for SSO authentication)',
    enum: SSOProviderType,
    enumName: 'SSOProviderType',
    required: false,
  })
  providerType?: SSOProviderType | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'The SSO provider ID (for SSO authentication)',
    required: false,
  })
  providerId?: number | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The SSO subject/ID from the provider',
    required: false,
  })
  ssoSubject?: string | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  @ApiProperty({
    description: 'The TOTP secret (for authenticator apps)',
    required: false,
  })
  totpSecret?: string | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  @ApiProperty({
    description: 'Deterministic hash used to enforce uniqueness of guest TOTP secrets',
    required: false,
  })
  totpSecretHash?: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  @ApiProperty({
    description: 'When TOTP was enabled for the user',
    required: false,
  })
  totpEnabledAt?: Date | null;

  @Column({ type: 'integer', nullable: true })
  @Exclude()
  @ApiProperty({
    description: 'Last TOTP time step that was successfully verified (replay protection for guest OTP)',
    required: false,
  })
  totpLastTimeStep?: number | null;

  @ManyToOne(() => User, (user) => user.authenticationDetails, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
