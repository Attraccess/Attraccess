import { ApiToken } from './api-token';

import { AuthenticationDetail } from './authenticationDetail';

import { BillingTransaction } from './billing-transaction';

import { FormSubmission } from './form';

import { Project } from './project';

import { ProjectInvitation } from './project-invitation';

import { ProjectMember } from './project-member';

import { ResourceIntroducer } from './resourceIntroducer';

import { ResourceIntroduction } from './resourceIntroduction';

import { ResourceUsage } from './resourceUsage';

import { NFCCard } from './rfidCard';

import { Session } from './session';

import { UserRole } from './user-role';

export interface User {
  emailVerificationToken: string | null;
  emailVerificationTokenExpiresAt: Date | null;
  passwordResetToken: string | null;
  passwordResetTokenExpiresAt: Date | null;
  lastUsernameChangeAt: Date | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  firstFailedLoginAt: Date | null;
  deleteAccountToken: string | null;
  deleteAccountTokenExpiresAt: Date | null;
  deleteAccountRequestedAt: Date | null;
  nfcKeySeedToken: string | null;
  id: number;
  username: string;
  email: string;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  resourceIntroductions: ResourceIntroduction[];
  resourceUsages: ResourceUsage[];
  authenticationDetails: AuthenticationDetail[];
  resourceIntroducerPermissions: ResourceIntroducer[];
  externalIdentifier: string | null;
  nfcCards: NFCCard[];
  sessions: Session[];
  billingTransactions: BillingTransaction[];
  initiatedBillingTransactions: BillingTransaction[];
  creditBalance: number;
  billingFactor: number;
  ownedProjects: Project[];
  projectMemberships: ProjectMember[];
  sentProjectInvitations: ProjectInvitation[];
  receivedProjectInvitations: ProjectInvitation[];
  formSubmissions: FormSubmission[];
  userRoles: UserRole[];
  apiTokens: ApiToken[];
}
