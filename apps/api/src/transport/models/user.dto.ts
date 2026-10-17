import { ApiProperty } from '@nestjs/swagger';

import { Exclude } from 'class-transformer';
import { ApiToken } from '@attraccess/application-models';

import { AuthenticationDetail } from './authenticationDetail.dto';

import { BillingTransaction } from './billing-transaction.dto';

import { FormSubmission } from './form.dto';

import { Project } from './project.dto';

import { ProjectInvitation } from './project-invitation.dto';

import { ProjectMember } from './project-member.dto';

import { ResourceIntroducer } from './resourceIntroducer.dto';

import { ResourceIntroduction } from './resourceIntroduction.dto';

import { ResourceUsage } from './resourceUsage.dto';

import { NFCCard } from './rfidCard.dto';

import { Session } from './session.dto';

import { UserRole } from './user-role.dto';
import type { ResponseFields } from '../response-mapper';
import { ApiTokenMetadataDto } from '../../users-and-auth/auth/api-token/api-token.dto';

/** Reuse the established token response shape; keep mapping policy in the transport model. */
class ApiTokenResponse extends ApiTokenMetadataDto {
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    permissionKeys: null,
    createdAt: null,
    lastUsedAt: null,
    expiresAt: null,
  };
}

export class User {
  @Exclude()
  emailVerificationToken!: string | null;

  @Exclude()
  emailVerificationTokenExpiresAt!: Date | null;

  @Exclude()
  passwordResetToken!: string | null;

  @Exclude()
  passwordResetTokenExpiresAt!: Date | null;

  @Exclude()
  lastUsernameChangeAt!: Date | null;

  @Exclude()
  lockedUntil!: Date | null;

  @Exclude()
  failedLoginAttempts!: number;

  @Exclude()
  firstFailedLoginAt!: Date | null;

  @Exclude()
  deleteAccountToken!: string | null;

  @Exclude()
  deleteAccountTokenExpiresAt!: Date | null;

  @Exclude()
  deleteAccountRequestedAt!: Date | null;

  @Exclude()
  nfcKeySeedToken!: string | null;

  @ApiProperty({
    description: 'The unique identifier of the user',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The username of the user',
    example: 'johndoe',
  })
  username!: string;

  @Exclude()
  email!: string;

  @ApiProperty({
    description: "The user's preferred locale (BCP 47 language tag)",
    example: 'en',
  })
  locale!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Formatting locale; null follows app language' })
  dateTimeLocale!: string | null;

  @ApiProperty({
    description: 'Whether the user has verified their email address',
    example: true,
  })
  isEmailVerified!: boolean;

  isDisabled!: boolean;

  @ApiProperty({
    description: 'When the user was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'When the user was soft-deleted',
    required: false,
  })
  deletedAt?: Date | null;

  resourceIntroductions!: ResourceIntroduction[];

  resourceUsages!: ResourceUsage[];

  @ApiProperty({
    description: 'Authentication details linked to the user',
    type: () => [AuthenticationDetail],
    required: false,
  })
  authenticationDetails!: AuthenticationDetail[];

  resourceIntroducerPermissions!: ResourceIntroducer[];

  @ApiProperty({
    description: 'The external (origin) identifier of the user, if the user is authenticated via SSO',
    example: '1234567890',
    nullable: true,
    required: false,
  })
  externalIdentifier!: string | null;

  nfcCards!: NFCCard[];

  sessions!: Session[];

  billingTransactions!: BillingTransaction[];

  initiatedBillingTransactions!: BillingTransaction[];

  @ApiProperty({ description: 'The credit balance of the user' })
  creditBalance!: number;

  @ApiProperty({
    description: 'The percentage rate the user to actually pay for activities that cost credits',
    example: 100,
  })
  billingFactor!: number;

  ownedProjects!: Project[];

  projectMemberships!: ProjectMember[];

  sentProjectInvitations!: ProjectInvitation[];

  receivedProjectInvitations!: ProjectInvitation[];

  formSubmissions!: FormSubmission[];

  @ApiProperty({ type: () => [UserRole], description: 'Role assignments for this user', required: false })
  userRoles!: UserRole[];

  apiTokens!: ApiToken[];
  static readonly responseFields: ResponseFields = {
    id: null,
    username: null,
    locale: null,
    dateTimeLocale: null,
    isEmailVerified: null,
    isDisabled: null,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
    resourceIntroductions: () => ResourceIntroduction,
    resourceUsages: () => ResourceUsage,
    authenticationDetails: () => AuthenticationDetail,
    resourceIntroducerPermissions: () => ResourceIntroducer,
    externalIdentifier: null,
    nfcCards: () => NFCCard,
    sessions: () => Session,
    billingTransactions: () => BillingTransaction,
    initiatedBillingTransactions: () => BillingTransaction,
    creditBalance: null,
    billingFactor: null,
    ownedProjects: () => Project,
    projectMemberships: () => ProjectMember,
    sentProjectInvitations: () => ProjectInvitation,
    receivedProjectInvitations: () => ProjectInvitation,
    formSubmissions: () => FormSubmission,
    userRoles: () => UserRole,
    apiTokens: () => ApiTokenResponse,
  };
}
