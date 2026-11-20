import type { CredentialRecord } from './authentication-credential';
import type { SSOProviderType } from './ssoProvider';
import type { UserRecord } from './user-record';
import type { UserRoleRecord } from './rbac-record';

/** A credential of a user as listed on the account: the type and the single sign-on binding, never a secret. */
export interface AccountCredentialRecord extends CredentialRecord {
  providerType: SSOProviderType | null;
  providerId: number | null;
  ssoSubject: string | null;
}

/** A user together with the relations a read asked for. */
export interface UserAccount extends UserRecord {
  authenticationDetails?: AccountCredentialRecord[];
  userRoles?: UserRoleRecord[];
}

/** The columns the application may change on an existing user. `undefined` leaves a column unchanged. */
export type UserPatch = Partial<
  Pick<
    UserRecord,
    | 'username'
    | 'email'
    | 'locale'
    | 'dateTimeLocale'
    | 'externalIdentifier'
    | 'billingFactor'
    | 'lastUsernameChangeAt'
    | 'emailVerificationToken'
    | 'emailVerificationTokenExpiresAt'
    | 'isEmailVerified'
    | 'passwordResetToken'
    | 'passwordResetTokenExpiresAt'
    | 'lockedUntil'
    | 'failedLoginAttempts'
    | 'firstFailedLoginAt'
  >
>;

/** A user to create. The identity arrives normalized (trimmed, lower case). */
export interface NewUser {
  username: string;
  email: string;
  externalIdentifier: string | null;
  isEmailVerified: boolean;
  locale: string;
}

/** Which users a listing returns. Role and single sign-on filters combine with AND. */
export interface UserListQuery {
  page: number;
  limit: number;
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
}

/** What anonymizing a user did. `active-usage` means the user still has a running usage session. */
export type AnonymizeUserOutcome =
  { outcome: 'anonymized'; locale: string } | { outcome: 'already-deleted' | 'not-found' | 'active-usage' };
