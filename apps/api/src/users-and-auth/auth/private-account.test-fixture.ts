import type { AuthenticatedSessionUser } from '@attraccess/application-models';

/** Every value a session response must never carry. */
const PRIVATE_VALUES = [
  'secret@example.com',
  'verify-secret',
  'reset-secret',
  'delete-secret',
  'nfc-secret',
  'bcrypt-hash-secret',
];

/** Keys of private account columns; none of them may appear in a session response. */
const PRIVATE_KEYS = [
  'email',
  'emailVerificationToken',
  'passwordResetToken',
  'deleteAccountToken',
  'nfcKeySeedToken',
  'lockedUntil',
  'failedLoginAttempts',
  'firstFailedLoginAt',
  'lastUsernameChangeAt',
  'password',
];

/** A plain account object as the authentication layer hands it over: private columns filled. */
export function privateAccount(): AuthenticatedSessionUser & { password: string } {
  return {
    id: 1,
    username: 'testuser',
    email: 'secret@example.com',
    locale: 'en',
    dateTimeLocale: null,
    isEmailVerified: true,
    isDisabled: false,
    externalIdentifier: null,
    creditBalance: 0,
    billingFactor: 100,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    lastUsernameChangeAt: new Date(),
    lockedUntil: new Date(),
    failedLoginAttempts: 4,
    firstFailedLoginAt: new Date(),
    emailVerificationToken: 'verify-secret',
    emailVerificationTokenExpiresAt: new Date(),
    passwordResetToken: 'reset-secret',
    passwordResetTokenExpiresAt: new Date(),
    deleteAccountToken: 'delete-secret',
    deleteAccountTokenExpiresAt: new Date(),
    deleteAccountRequestedAt: null,
    nfcKeySeedToken: 'nfc-secret',
    password: 'bcrypt-hash-secret',
  };
}

/** Asserts a login response carries the public profile of {@link privateAccount} and nothing private. */
export function expectNoPrivateAccountFields(response: unknown): void {
  const user = (response as { user: Record<string, unknown> }).user;
  expect(user).toMatchObject({ id: 1, username: 'testuser', locale: 'en' });
  for (const key of PRIVATE_KEYS) expect(user).not.toHaveProperty(key);
  const json = JSON.stringify(response);
  for (const value of PRIVATE_VALUES) expect(json).not.toContain(value);
}
