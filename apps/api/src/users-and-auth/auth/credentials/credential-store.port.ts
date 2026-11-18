import type {
  CredentialRecord,
  NewCredential,
  SsoCredentialRecord,
  SSOProviderType,
  TotpCredentialRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../../database/transaction-context';

/** DI token for the {@link CredentialStore}. */
export const CREDENTIAL_STORE = Symbol.for('attraccess.auth.credential-store');

/** Where the password and single sign-on credentials of users live. Password hashes only leave through verification. */
export interface CredentialStore {
  findUserIdBySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<number | null>;
  findSso(userId: number): Promise<SsoCredentialRecord | null>;
  updateSsoSubject(credentialId: number, subject: string): Promise<void>;
  /**
   * The bcrypt hash of the user's local password, for verification only. Null when the user has no local password
   * credential; an empty string when the credential exists without a hash.
   */
  findLocalPasswordHash(userId: number): Promise<string | null>;
  /** Adds a credential, in the caller's transaction when one is given. */
  add(userId: number, credential: NewCredential, context?: TransactionContext): Promise<CredentialRecord>;
  /**
   * Sets the local password hash (creating the credential when there is none). With `rememberPrevious` > 0 the
   * replaced hash is archived to the password history, which then keeps only that many entries, all in the same
   * atomic step as the change: a failure leaves the old password and the history as they were.
   */
  replaceLocalPassword(
    userId: number,
    passwordHash: string,
    options: { rememberPrevious: number },
    context?: TransactionContext,
  ): Promise<void>;
  removeLocalPassword(userId: number): Promise<void>;
  remove(credentialId: number): Promise<void>;
}

/** DI token for the {@link TotpStore}. */
export const TOTP_STORE = Symbol.for('attraccess.auth.totp-store');

/** Where the authenticator-app enrollments of users live. */
export interface TotpStore {
  find(userId: number): Promise<TotpCredentialRecord | null>;
  /** Stores a new (not yet enabled) secret, replacing a previous enrollment of the user. */
  saveSetup(userId: number, encryptedSecret: string): Promise<void>;
  markEnabled(credentialId: number, enabledAt: Date): Promise<void>;
  remove(credentialId: number): Promise<void>;
}
