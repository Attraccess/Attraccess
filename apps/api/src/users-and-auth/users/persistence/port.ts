export abstract class SignupDomainPersistence {
  abstract readWhitelist(): Promise<string | null>;
  abstract updateWhitelist(value: string): Promise<void>;
}

import type { User, Role, SSOProviderType } from '@attraccess/application-models';
import { operationToken } from '../../../database/transaction-scope';
import type { PaginationOptions } from '../../../types/request';

export type UserListOptions = PaginationOptions & {
  search?: string;
  ids?: number[];
  roleId?: number;
  roleIds?: number[];
  excludeRoleIds?: number[];
  roleMatch?: 'any' | 'all';
  emailVerified?: boolean;
  ssoProviderIds?: number[];
  excludeSsoProviderIds?: number[];
  ssoProviderNone?: boolean;
  hasSsoProvider?: boolean;
  ssoProviderMatch?: 'any' | 'all';
  includeRoles?: boolean;
};
export interface UserLookup {
  id?: number;
  username?: string;
  email?: string;
  externalIdentifier?: string;
}
export type UserRelations = readonly ('authenticationDetails' | 'userRoles' | 'userRoles.role')[];
export type NewUserAccount = Pick<User, 'username' | 'email' | 'externalIdentifier'> &
  Partial<Pick<User, 'isEmailVerified' | 'locale'>>;
export type UserAccountChanges = Partial<
  Pick<
    User,
    | 'username'
    | 'email'
    | 'externalIdentifier'
    | 'isEmailVerified'
    | 'locale'
    | 'dateTimeLocale'
    | 'emailVerificationToken'
    | 'emailVerificationTokenExpiresAt'
    | 'passwordResetToken'
    | 'passwordResetTokenExpiresAt'
    | 'lockedUntil'
    | 'failedLoginAttempts'
    | 'firstFailedLoginAt'
    | 'lastUsernameChangeAt'
    | 'deleteAccountToken'
    | 'deleteAccountTokenExpiresAt'
    | 'deleteAccountRequestedAt'
    | 'nfcKeySeedToken'
    | 'billingFactor'
  >
>;
export type UpdateUserData = Pick<
  UserAccountChanges,
  | 'externalIdentifier'
  | 'emailVerificationToken'
  | 'emailVerificationTokenExpiresAt'
  | 'isEmailVerified'
  | 'passwordResetToken'
  | 'passwordResetTokenExpiresAt'
  | 'lockedUntil'
  | 'failedLoginAttempts'
  | 'firstFailedLoginAt'
>;
export class AccountWriteConflictError extends Error {}

export abstract class UserOperations {
  abstract account(lookup: UserLookup, relations?: UserRelations, includeDeleted?: boolean): Promise<User | null>;
  abstract count(excludedUserId?: number): Promise<number>;
  abstract createAccount(input: NewUserAccount): Promise<User>;
  abstract createAccounts(input: readonly NewUserAccount[]): Promise<User[]>;
  abstract patchAccount(userId: number, changes: UserAccountChanges): Promise<void>;
  abstract hardDeleteAccount(userId: number): Promise<void>;
  abstract firstAccount(): Promise<User | null>;
  abstract claimSetupAccount(userId: number, username: string, email: string): Promise<boolean>;
  abstract roleForImport(key: string): Promise<Role | null>;
  abstract hasOpenUsage(userId: number): Promise<boolean>;
  abstract removeAuthentication(userId: number): Promise<void>;
  abstract removeSessions(userId: number): Promise<void>;
  abstract softDeleteAccount(userId: number): Promise<void>;
}
export const USER_WRITES = operationToken<UserOperations>('user-writes', [
  'account',
  'count',
  'createAccount',
  'createAccounts',
  'patchAccount',
  'hardDeleteAccount',
  'firstAccount',
  'claimSetupAccount',
  'roleForImport',
  'hasOpenUsage',
  'removeAuthentication',
  'removeSessions',
  'softDeleteAccount',
]);
export abstract class UserPersistence extends UserOperations {
  abstract isWriteConflict(error: unknown): boolean;
  abstract ssoUser(userId: number): Promise<boolean>;
  abstract bySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<User | null>;
  abstract byEmailsOrUsernames(emails: readonly string[], usernames: readonly string[]): Promise<User[]>;
  abstract caseInsensitiveEmailMatches(email: string): Promise<User[]>;
  abstract page(options: UserListOptions): Promise<{ data: User[]; total: number; page: number; limit: number }>;
  abstract deletedAccountByTokens(tokens: readonly string[]): Promise<User | null>;
}
