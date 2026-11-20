import type {
  AuthenticatedSessionUser,
  NewPasskey,
  PasskeyChallengeRecord,
  PasskeyRecord,
} from '@attraccess/application-models';

/** DI token for the {@link PasskeyStore}. */
export const PASSKEY_STORE = Symbol.for('attraccess.auth.passkey-store');

/** Where registered passkeys and pending ceremony challenges live. */
export interface PasskeyStore {
  /** The user's passkeys, newest first. */
  listForUser(userId: number): Promise<PasskeyRecord[]>;
  findByCredentialId(credentialId: string): Promise<PasskeyRecord | null>;
  register(passkey: NewPasskey): Promise<PasskeyRecord>;
  /** Renames a passkey of this user; null when the user owns no such passkey. */
  renameOwned(userId: number, passkeyId: number, name: string): Promise<PasskeyRecord | null>;
  /** Deletes a passkey of this user; false when the user owns no such passkey. */
  deleteOwned(userId: number, passkeyId: number): Promise<boolean>;
  /** Stores what a successful sign-in reported: the new signature counter and backup state. */
  recordUse(passkeyId: number, use: { counter: number; backedUp: boolean; usedAt: Date }): Promise<void>;
  /** The account a passkey signs in; null when it no longer exists. */
  findSignInUser(userId: number): Promise<AuthenticatedSessionUser | null>;
  /** Stores a new challenge and sweeps the expired ones. */
  issueChallenge(challenge: PasskeyChallengeRecord): Promise<void>;
  /**
   * Removes the challenge and returns what was stored, in one atomic step: of any number of concurrent calls for
   * the same challenge exactly one receives it, so a captured assertion cannot be replayed. Null when there is none.
   */
  consumeChallenge(challenge: string): Promise<PasskeyChallengeRecord | null>;
}
