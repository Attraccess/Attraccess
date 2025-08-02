import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ResourceIntroduction } from './resourceIntroduction.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { AuthenticationDetail } from './authenticationDetail.entity';
import { ResourceIntroducer } from './resourceIntroducer.entity';
import { NFCCard } from './nfcCard.entity';
import { Session } from './session.entity';

export class SystemPermissions {
  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether the user can manage resources',
    example: false,
  })
  canManageResources!: boolean;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether the user can manage system configuration',
    example: false,
  })
  canManageSystemConfiguration!: boolean;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether the user can manage users',
    example: false,
  })
  canManageUsers!: boolean;
}

export type SystemPermission = keyof SystemPermissions;

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the user',
    example: 1,
  })
  id!: number;

  @Column({
    unique: true,
    type: 'text',
  })
  @ApiProperty({
    description: 'The username of the user',
    example: 'johndoe',
  })
  username!: string;

  @Column({ unique: true, type: 'text' })
  @Exclude()
  email!: string;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether the user has verified their email address',
    example: true,
  })
  isEmailVerified!: boolean;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  emailVerificationToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  emailVerificationTokenExpiresAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  passwordResetToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  passwordResetTokenExpiresAt!: Date | null;

  @Column(() => SystemPermissions, { prefix: '' })
  @ApiProperty({
    description: 'System-wide permissions for the user',
    example: {
      canManageResources: true,
      canManageSystemConfiguration: false,
      canManageUsers: false,
    },
  })
  systemPermissions!: SystemPermissions;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the user was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;

  @OneToMany(() => ResourceIntroduction, (introduction) => introduction.receiverUser, {
    onDelete: 'CASCADE',
  })
  resourceIntroductions!: ResourceIntroduction[];

  @OneToMany(() => ResourceUsage, (usage) => usage.user, {
    onDelete: 'SET NULL',
  })
  resourceUsages!: ResourceUsage[];

  @OneToMany(() => AuthenticationDetail, (detail) => detail.user, {
    onDelete: 'CASCADE',
  })
  authenticationDetails!: AuthenticationDetail[];

  @OneToMany(() => ResourceIntroducer, (introducer) => introducer.user, {
    onDelete: 'CASCADE',
  })
  resourceIntroducerPermissions!: ResourceIntroducer[];

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'The external (origin) identifier of the user, if the user is authenticated via SSO',
    example: '1234567890',
    nullable: true,
    required: false,
  })
  externalIdentifier!: string | null;

  @OneToMany(() => NFCCard, (card) => card.user, {
    onDelete: 'CASCADE',
  })
  nfcCards!: NFCCard[];

  @Column({ type: 'text', nullable: true })
  @Exclude()
  nfcKeySeedToken!: string | null;

  @OneToMany(() => Session, (session) => session.user, {
    onDelete: 'CASCADE',
  })
  sessions!: Session[];
}
