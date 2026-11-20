import type {
  AnonymizeUserOutcome,
  NewUser,
  SSOProviderType,
  UserAccount,
  UserListQuery,
  UserPatch,
  UserRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';

/** Which user to find. Values arrive normalized (trimmed, lower case); at least one is set. */
export interface UserLookup {
  id?: number;
  username?: string;
  email?: string;
}

/** The identity a retired or replaced account is renamed to so its username and email can be reused. */
export interface UserIdentity {
  username: string;
  email: string;
}

/** Which unique identity of a user an insert collided with. */
export type UserIdentityField = 'email' | 'username';

/**
 * Another account already holds the email or username: a concurrent insert or rename took it after the caller's
 * existence check, and the unique constraint rejected the write.
 */
export class UserIdentityTakenError extends Error {
  constructor(readonly field: UserIdentityField) {
    super(field === 'email' ? 'USER_EMAIL_TAKEN' : 'USER_USERNAME_TAKEN');
    this.name = 'UserIdentityTakenError';
  }
}

/** A pending self-deletion confirmation. The token is stored hashed. */
export interface DeleteAccountRequest {
  tokenHash: string;
  expiresAt: Date;
  requestedAt: Date;
}

/** What an email change replaced, to put back when the confirmation mail cannot be sent. */
export interface EmailChangeSnapshot {
  email: string;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationTokenExpiresAt: Date | null;
}

/**
 * User accounts as the application stores them. Operations that take a `context` run inside the caller's unit of
 * work and see its uncommitted state; without one they use the application connection. Reads skip soft-deleted
 * users unless the operation says otherwise.
 */
export interface UserStore {
  findUser(lookup: UserLookup, withCredentials?: boolean, context?: TransactionContext): Promise<UserAccount | null>;
  /** The user bound to the identity at a single sign-on provider, with their credentials. */
  findUserBySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<UserAccount | null>;
  hasSsoCredential(userId: number): Promise<boolean>;
  /** Active users, optionally not counting one. */
  countUsers(options?: { excludingUserId?: number }, context?: TransactionContext): Promise<number>;
  /** Users holding any of the (normalized) emails or usernames. */
  findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<UserRecord[]>;
  /** The first active user by id, or null on an empty installation. */
  findFirstUser(context?: TransactionContext): Promise<UserRecord | null>;
  listUsers(query: UserListQuery): Promise<{ users: UserAccount[]; total: number }>;

  /**
   * Waits until no other unit of work creates or claims an account, on any API instance, and holds that until
   * `context` ends. Account creation takes it before its "first user" and "first-time setup" checks, so two
   * registrations cannot both see an empty installation and both become administrator.
   */
  lockAccountCreation(context: TransactionContext): Promise<void>;

  /** Throws {@link UserIdentityTakenError} when the email or username is taken. */
  insertUser(user: NewUser, context?: TransactionContext): Promise<UserRecord>;
  /** Inserts the users in order; the result has the same order. Throws like {@link insertUser}. */
  insertUsers(users: NewUser[], context?: TransactionContext): Promise<UserRecord[]>;
  /** Changes the given columns. A patch without a defined column changes nothing. */
  updateUser(userId: number, patch: UserPatch, context?: TransactionContext): Promise<void>;

  /**
   * Renames the still-unverified first-time-setup account so a replacement can use its identity, in one
   * conditional statement that only succeeds while that account is the sole active one. False when it was not.
   * The caller holds {@link lockAccountCreation} in the same `context`: a claim that waited for a concurrent one
   * would otherwise judge "sole active account" on a snapshot from before that claim committed.
   */
  claimFirstTimeSetupAccount(userId: number, identity: UserIdentity, context?: TransactionContext): Promise<boolean>;
  /** Removes a just-registered replacement and restores the first-time-setup account's identity, atomically. */
  restoreFirstTimeSetupAccount(replacementUserId: number, original: { id: number } & UserIdentity): Promise<void>;
  /** Removes a just-created user without the rules of account deletion (nothing refers to it yet). */
  discardUser(userId: number, context?: TransactionContext): Promise<void>;
  /** Removes invited users that have not verified their email, role assignments included. */
  discardUnacceptedInvitations(userIds: number[]): Promise<void>;

  /**
   * Single use: clears the stored verification token and marks the email verified only if the user still holds
   * exactly `storedToken`. True for exactly one of any number of concurrent callers.
   */
  consumeEmailVerificationToken(userId: number, storedToken: string, context?: TransactionContext): Promise<boolean>;
  /** Single use, like {@link consumeEmailVerificationToken}, for the password reset token. */
  consumePasswordResetToken(userId: number, storedToken: string, context?: TransactionContext): Promise<boolean>;
  /**
   * Puts back what an email change replaced, but only while the user still holds the token the change issued, so a
   * newer change is not undone.
   */
  revertEmailChange(userId: number, issuedToken: string, previous: EmailChangeSnapshot): Promise<boolean>;

  recordDeleteAccountRequest(userId: number, request: DeleteAccountRequest): Promise<void>;
  /**
   * The user (also a deleted one) a self-deletion confirmation refers to: by email, or by the retained token when
   * the email no longer identifies it. `tokens` holds the accepted stored forms of the token.
   */
  findForDeletionConfirmation(email: string, tokens: string[]): Promise<UserRecord | null>;
  /**
   * Retires the account: drops its credentials and database sessions, renames it to `identity`, clears tokens and
   * soft-deletes it. Refuses while the user has a running usage session.
   */
  anonymizeUser(userId: number, identity: UserIdentity, context?: TransactionContext): Promise<AnonymizeUserOutcome>;
}

export const USER_STORE = Symbol.for('attraccess.users-and-auth.user-store');
