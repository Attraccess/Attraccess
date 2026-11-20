import type {
  AnonymizeUserOutcome,
  NewUser,
  SSOProviderType,
  UserAccount,
  UserListQuery,
  UserPatch,
  UserRecord,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../../database/transaction-context';
import type { TransactionScope, UnitOfWork } from '../../../database/unit-of-work';
import type {
  DeleteAccountRequest,
  EmailChangeSnapshot,
  UserIdentity,
  UserLookup,
  UserStore,
} from '../user-store.port';

export function aUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    locale: 'en',
    dateTimeLocale: null,
    isEmailVerified: true,
    isDisabled: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    externalIdentifier: null,
    creditBalance: 0,
    billingFactor: 100,
    emailVerificationToken: null,
    emailVerificationTokenExpiresAt: null,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    lastUsernameChangeAt: null,
    lockedUntil: null,
    failedLoginAttempts: 0,
    firstFailedLoginAt: null,
    deleteAccountToken: null,
    deleteAccountTokenExpiresAt: null,
    deleteAccountRequestedAt: null,
    nfcKeySeedToken: null,
    ...overrides,
  };
}

/** A unit of work that commits when the work resolves: post-commit callbacks then run, never after a failure. */
export class FakeUnitOfWork implements UnitOfWork {
  readonly scopes: TransactionScope[] = [];
  readonly events: string[] = [];
  private active: TransactionScope | undefined;

  current(): TransactionScope | undefined {
    return this.active;
  }

  async run<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    if (this.active) return work(this.active);
    const callbacks: Array<() => void | Promise<void>> = [];
    const scope: TransactionScope = {
      isOpen: true,
      afterCommit: (callback) => {
        callbacks.push(callback);
      },
    };
    this.scopes.push(scope);
    this.active = scope;
    let result: T;
    try {
      this.events.push('begin');
      result = await work(scope);
    } catch (error) {
      this.events.push('rollback');
      throw error;
    } finally {
      this.active = undefined;
    }
    this.events.push('commit');
    for (const callback of callbacks) await callback();
    return result;
  }
}

/** An in-memory UserStore. It keeps the rules the adapter owns that the services depend on (uniqueness aside). */
export class InMemoryUserStore implements UserStore {
  users: UserAccount[] = [];
  private nextId = 1;
  calls: string[] = [];
  /** Makes the next `updateUser` fail with this error. */
  failNextUpdateWith?: Error;
  activeUsageUserIds = new Set<number>();

  seed(...users: Array<Partial<UserAccount>>): UserAccount[] {
    return users.map((user) => {
      const record: UserAccount = { ...aUserRecord({ id: this.nextId++ }), ...user };
      this.nextId = Math.max(this.nextId, record.id + 1);
      this.users.push(record);
      return { ...record };
    });
  }

  private active(): UserAccount[] {
    return this.users.filter((user) => !user.deletedAt);
  }

  async findUser(lookup: UserLookup, withCredentials = false, _context?: TransactionContext) {
    const found = this.active().find(
      (user) =>
        (lookup.id === undefined || user.id === lookup.id) &&
        (lookup.username === undefined || user.username === lookup.username) &&
        (lookup.email === undefined || user.email === lookup.email),
    );
    if (!found) return null;
    const copy = { ...found };
    if (!withCredentials) delete copy.authenticationDetails;
    return copy;
  }

  async findUserBySso(_type: SSOProviderType, providerId: number, subject: string) {
    return (
      this.active().find((user) =>
        user.authenticationDetails?.some((detail) => detail.providerId === providerId && detail.ssoSubject === subject),
      ) ?? null
    );
  }

  async hasSsoCredential(userId: number) {
    return !!this.users.find((user) => user.id === userId)?.authenticationDetails?.some((d) => d.type === 'sso');
  }

  async countUsers(options: { excludingUserId?: number } = {}) {
    return this.active().filter((user) => user.id !== options.excludingUserId).length;
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]) {
    return this.active()
      .filter((user) => emails.includes(user.email) || usernames.includes(user.username))
      .map((user) => ({ ...user }));
  }

  async findFirstUser() {
    const first = this.active()[0];
    return first ? { ...first } : null;
  }

  async listUsers(query: UserListQuery) {
    const matching = this.active()
      .filter((user) => !query.ids || query.ids.includes(user.id))
      .filter((user) => !query.search || user.username.includes(query.search) || user.email.includes(query.search));
    const start = (query.page - 1) * query.limit;
    return { users: matching.slice(start, start + query.limit), total: matching.length };
  }

  async lockAccountCreation(_context: TransactionContext) {
    this.calls.push('lockAccountCreation');
  }

  async insertUser(user: NewUser) {
    const [saved] = await this.insertUsers([user]);
    return saved;
  }

  async insertUsers(users: NewUser[]) {
    return users.map((user) => {
      const record = aUserRecord({ ...user, id: this.nextId++, isEmailVerified: user.isEmailVerified });
      this.users.push(record);
      return record;
    });
  }

  async updateUser(userId: number, patch: UserPatch) {
    this.calls.push(`updateUser:${userId}:${Object.keys(patch).join(',')}`);
    if (this.failNextUpdateWith) {
      const error = this.failNextUpdateWith;
      this.failNextUpdateWith = undefined;
      throw error;
    }
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) return;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (user as unknown as Record<string, unknown>)[key] = value;
    }
  }

  async claimFirstTimeSetupAccount(userId: number, identity: UserIdentity) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.isEmailVerified || this.active().some((other) => other.id !== userId)) return false;
    Object.assign(user, identity);
    return true;
  }

  async restoreFirstTimeSetupAccount(replacementUserId: number, original: { id: number } & UserIdentity) {
    this.users = this.users.filter((user) => user.id !== replacementUserId);
    const user = this.users.find((candidate) => candidate.id === original.id);
    if (user) Object.assign(user, { username: original.username, email: original.email });
  }

  async discardUser(userId: number) {
    this.users = this.users.filter((user) => user.id !== userId);
  }

  async discardUnacceptedInvitations(userIds: number[]) {
    this.calls.push(`discardUnacceptedInvitations:${userIds.join(',')}`);
    this.users = this.users.filter((user) => !(userIds.includes(user.id) && !user.isEmailVerified));
  }

  async consumeEmailVerificationToken(userId: number, storedToken: string) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.emailVerificationToken !== storedToken) return false;
    Object.assign(user, { isEmailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiresAt: null });
    return true;
  }

  async consumePasswordResetToken(userId: number, storedToken: string) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.passwordResetToken !== storedToken) return false;
    Object.assign(user, { passwordResetToken: null, passwordResetTokenExpiresAt: null });
    return true;
  }

  async revertEmailChange(userId: number, issuedToken: string, previous: EmailChangeSnapshot) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.emailVerificationToken !== issuedToken) return false;
    Object.assign(user, previous);
    return true;
  }

  async recordDeleteAccountRequest(userId: number, request: DeleteAccountRequest) {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (user) {
      user.deleteAccountToken = request.tokenHash;
      user.deleteAccountTokenExpiresAt = request.expiresAt;
      user.deleteAccountRequestedAt = request.requestedAt;
    }
  }

  async findForDeletionConfirmation(email: string, tokens: string[]) {
    return (
      this.users.find((user) => user.email === email && tokens.includes(user.deleteAccountToken ?? '')) ??
      this.users.find((user) => user.deletedAt && tokens.includes(user.deleteAccountToken ?? '')) ??
      this.users.find((user) => user.email === email) ??
      null
    );
  }

  async anonymizeUser(userId: number, identity: UserIdentity): Promise<AnonymizeUserOutcome> {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) return { outcome: 'not-found' };
    if (user.deletedAt) return { outcome: 'already-deleted' };
    if (this.activeUsageUserIds.has(userId)) return { outcome: 'active-usage' };
    Object.assign(user, identity, { isEmailVerified: false, deletedAt: new Date() });
    return { outcome: 'anonymized', locale: user.locale };
  }
}
