import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { ResourceIntroduction } from './resourceIntroduction.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { AuthenticationDetail } from './authenticationDetail.entity';
import { ResourceIntroducer } from './resourceIntroducer.entity';
import { NFCCard } from './nfcCard.entity';
import { Session } from './session.entity';
import { BillingTransaction } from './billing-transaction.entity';
import { Project } from './project';
import { ProjectMember } from './project-member.entity';
import { ProjectInvitation } from './project-invitation.entity';
import { FormSubmission } from './form';
import { UserRole } from './user-role.entity';
import { ApiToken } from './api-token.entity';


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

  @Column({ type: 'varchar', length: 35, default: 'en' })
  @ApiProperty({
    description: "The user's preferred locale (BCP 47 language tag)",
    example: 'en',
  })
  locale!: string;

  @Column({ default: false, type: 'boolean' })
  @ApiProperty({
    description: 'Whether the user has verified their email address',
    example: true,
  })
  isEmailVerified!: boolean;

  @Column({ default: false, type: 'boolean' })
  isDisabled!: boolean;

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

  @DeleteDateColumn({ type: 'datetime' })
  @ApiProperty({
    description: 'When the user was soft-deleted',
    required: false,
  })
  deletedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lastUsernameChangeAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lockedUntil!: Date | null;

  @Column({ type: 'integer', default: 0 })
  @Exclude()
  failedLoginAttempts!: number;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  firstFailedLoginAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  @Exclude()
  deleteAccountToken!: string | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  deleteAccountTokenExpiresAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  deleteAccountRequestedAt!: Date | null;

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
  @ApiProperty({
    description: 'Authentication details linked to the user',
    type: [AuthenticationDetail],
    required: false,
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

  @OneToMany(() => BillingTransaction, (transaction) => transaction.user, {
    onDelete: 'CASCADE',
  })
  billingTransactions!: BillingTransaction[];

  @OneToMany(() => BillingTransaction, (transaction) => transaction.initiator, {
    onDelete: 'CASCADE',
  })
  initiatedBillingTransactions!: BillingTransaction[];

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'The credit balance of the user' })
  creditBalance!: number;

  @Column({ type: 'integer', default: 100 })
  @ApiProperty({
    description: 'The percentage rate the user to actually pay for activities that cost credits',
    example: 100,
  })
  billingFactor!: number;

  @OneToMany(() => Project, (project) => project.owner, {
    onDelete: 'CASCADE',
  })
  ownedProjects!: Project[];

  @OneToMany(() => ProjectMember, (member) => member.user, {
    onDelete: 'CASCADE',
  })
  projectMemberships!: ProjectMember[];

  @OneToMany(() => ProjectInvitation, (invitation) => invitation.inviter, {
    onDelete: 'CASCADE',
  })
  sentProjectInvitations!: ProjectInvitation[];

  @OneToMany(() => ProjectInvitation, (invitation) => invitation.invitedUser, {
    onDelete: 'CASCADE',
  })
  receivedProjectInvitations!: ProjectInvitation[];

  @OneToMany(() => FormSubmission, (submission) => submission.user, {
    onDelete: 'CASCADE',
  })
  formSubmissions!: FormSubmission[];

  @OneToMany(() => UserRole, (ur) => ur.user, { onDelete: 'CASCADE' })
  @ApiProperty({ type: [UserRole], description: 'Role assignments for this user', required: false })
  userRoles!: UserRole[];

  @OneToMany(() => ApiToken, (apiToken) => apiToken.user, { onDelete: 'CASCADE' })
  apiTokens!: ApiToken[];
}
