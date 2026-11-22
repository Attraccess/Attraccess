import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuthenticationType,
  type AnonymizeUserOutcome,
  type NewUser,
  type SSOProviderType,
  type UserAccount,
  type UserListQuery,
  type UserPatch,
  type UserRecord,
} from '@attraccess/application-models';
import { AuthenticationDetail, DashboardPin, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { DataSource, EntityManager, FindOptionsWhere, In, IsNull, Not } from 'typeorm';
import {
  UserIdentityTakenError,
  type DeleteAccountRequest,
  type EmailChangeSnapshot,
  type UserIdentity,
  type UserIdentityField,
  type UserLookup,
  type UserStore,
} from '../../../users-and-auth/users/user-store.port';
import { isUniqueViolation } from '../../persistence-errors';
import type { TransactionContext } from '../../transaction-context';
import { TransactionContextResolver } from '../transaction-context';
import { toUserAccount, toUserRecord } from './user-mapping';
import { applyUserListFilters, USER_DISPLAY_NAME_SORT_SQL } from './user-list-query';
import { findRelations } from '../find-options';

/**
 * Advisory lock key (one key, transaction-scoped) that serialises account creation and the first-time-setup claim
 * across connections and API instances. Listed with the other keys in `../resources/resource-locks.ts`.
 */
const ACCOUNT_CREATION_LOCK = 584_102;

/** The identity column whose unique constraint rejected a user insert, when that was the reason. */
function takenIdentity(manager: EntityManager, error: unknown): UserIdentityField | undefined {
  if (!isUniqueViolation(error)) return undefined;
  const constraint =
    (error as { driverError?: { constraint?: unknown } }).driverError?.constraint ??
    (error as { constraint?: unknown }).constraint;
  const unique = manager.connection
    .getMetadata(User)
    .uniques.find((candidate) => candidate.name === constraint && candidate.columns.length === 1);
  const column = unique?.columns[0].propertyName;
  return column === 'email' || column === 'username' ? column : undefined;
}

@Injectable()
export class TypeOrmUserStore implements UserStore {
  constructor(
    @InjectDataSource() private readonly source: DataSource,
    private readonly tx: TransactionContextResolver,
  ) {}

  private manager(context?: TransactionContext): EntityManager {
    return this.tx.manager(context);
  }

  async findUser(
    lookup: UserLookup,
    withCredentials = false,
    context?: TransactionContext,
  ): Promise<UserAccount | null> {
    const user = await this.manager(context)
      .getRepository(User)
      .findOne({ where: lookup, relations: findRelations(withCredentials ? ['authenticationDetails'] : undefined) });
    return user ? toUserAccount(user) : null;
  }

  async findUserBySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<UserAccount | null> {
    const user = await this.source
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails')
      .where('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .andWhere('authenticationDetails.providerType = :providerType', { providerType })
      .andWhere('authenticationDetails.providerId = :providerId', { providerId })
      .andWhere('authenticationDetails.ssoSubject = :subject', { subject })
      .getOne();
    return user ? toUserAccount(user) : null;
  }

  async hasSsoCredential(userId: number): Promise<boolean> {
    const ssoUser = await this.source
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .leftJoin('user.authenticationDetails', 'authenticationDetails')
      .andWhere('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .getOne();
    return !!ssoUser;
  }

  async countUsers(options: { excludingUserId?: number } = {}, context?: TransactionContext): Promise<number> {
    const repository = this.manager(context).getRepository(User);
    return options.excludingUserId === undefined
      ? repository.count()
      : repository.count({ where: { id: Not(options.excludingUserId) } });
  }

  async findByEmailsOrUsernames(emails: string[], usernames: string[]): Promise<UserRecord[]> {
    const where: FindOptionsWhere<User>[] = [];
    if (emails.length) where.push({ email: In(emails) });
    if (usernames.length) where.push({ username: In(usernames) });
    if (!where.length) return [];
    return (await this.source.getRepository(User).find({ where })).map(toUserRecord);
  }

  async findFirstUser(context?: TransactionContext): Promise<UserRecord | null> {
    const [first] = await this.manager(context).getRepository(User).find({ take: 1 });
    return first ? toUserRecord(first) : null;
  }

  async listUsers(query: UserListQuery): Promise<{ users: UserAccount[]; total: number }> {
    const skip = (query.page - 1) * query.limit;
    const repository = this.source.getRepository(User);

    const builder = repository.createQueryBuilder('user');
    applyUserListFilters(builder, query);
    const [users, total] = await builder
      .addSelect(USER_DISPLAY_NAME_SORT_SQL, 'user_display_name_sort')
      .orderBy('user_display_name_sort', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip(skip)
      .take(query.limit)
      .getManyAndCount();
    return { users: users.map(toUserAccount), total };
  }

  async lockAccountCreation(context: TransactionContext): Promise<void> {
    await this.manager(context).query('SELECT pg_advisory_xact_lock($1)', [ACCOUNT_CREATION_LOCK]);
  }

  async insertUser(user: NewUser, context?: TransactionContext): Promise<UserRecord> {
    const [saved] = await this.insertUsers([user], context);
    return saved;
  }

  async insertUsers(users: NewUser[], context?: TransactionContext): Promise<UserRecord[]> {
    if (!users.length) return [];
    return this.tx.run(context, async (manager) => {
      const repository = manager.getRepository(User);
      const entities = users.map((data) => {
        const entity = repository.create();
        entity.username = data.username;
        entity.firstName = data.firstName ?? null;
        entity.lastName = data.lastName ?? null;
        entity.email = data.email;
        entity.externalIdentifier = data.externalIdentifier;
        entity.isEmailVerified = data.isEmailVerified;
        entity.locale = data.locale;
        return entity;
      });
      try {
        const saved = await repository.save(entities);
        return saved.map(toUserRecord);
      } catch (error) {
        const field = takenIdentity(manager, error);
        if (field) throw new UserIdentityTakenError(field);
        throw error;
      }
    });
  }

  async updateUser(userId: number, patch: UserPatch, context?: TransactionContext): Promise<void> {
    // An undefined value leaves its column alone; an update that sets nothing is not sent at all.
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) return;
    await this.manager(context).getRepository(User).update(userId, changes);
  }

  async claimFirstTimeSetupAccount(
    userId: number,
    identity: UserIdentity,
    context?: TransactionContext,
  ): Promise<boolean> {
    // Callers hold lockAccountCreation first: under READ COMMITTED a claim that waited for the row lock of a
    // concurrent claim re-checks only the row, while NOT EXISTS keeps its old snapshot and would let both through.
    const claim = await this.manager(context)
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({ username: identity.username, email: identity.email })
      .where('"id" = :id', { id: userId })
      .andWhere('"isEmailVerified" = :isEmailVerified', { isEmailVerified: false })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM "user" AS "other" WHERE "other"."id" != :id AND "other"."deletedAt" IS NULL)',
      )
      .execute();
    return claim.affected === 1;
  }

  async restoreFirstTimeSetupAccount(
    replacementUserId: number,
    original: { id: number } & UserIdentity,
  ): Promise<void> {
    await this.tx.run(undefined, async (manager) => {
      await manager.delete(User, replacementUserId);
      await manager.getRepository(User).update(original.id, { username: original.username, email: original.email });
    });
  }

  async discardUser(userId: number, context?: TransactionContext): Promise<void> {
    await this.tx.run(context, async (manager) => {
      await manager.delete(User, userId);
    });
  }

  async discardUnacceptedInvitations(userIds: number[]): Promise<void> {
    if (!userIds.length) return;
    await this.source.getRepository(User).delete({ id: In(userIds), isEmailVerified: false });
  }

  async consumeEmailVerificationToken(
    userId: number,
    storedToken: string,
    context?: TransactionContext,
  ): Promise<boolean> {
    const result = await this.manager(context)
      .getRepository(User)
      .update(
        { id: userId, emailVerificationToken: storedToken },
        { isEmailVerified: true, emailVerificationToken: null, emailVerificationTokenExpiresAt: null },
      );
    return result.affected === 1;
  }

  async consumePasswordResetToken(userId: number, storedToken: string, context?: TransactionContext): Promise<boolean> {
    const result = await this.manager(context)
      .getRepository(User)
      .update(
        { id: userId, passwordResetToken: storedToken },
        { passwordResetToken: null, passwordResetTokenExpiresAt: null },
      );
    return result.affected === 1;
  }

  async revertEmailChange(userId: number, issuedToken: string, previous: EmailChangeSnapshot): Promise<boolean> {
    const result = await this.source.getRepository(User).update(
      { id: userId, emailVerificationToken: issuedToken },
      {
        email: previous.email,
        isEmailVerified: previous.isEmailVerified,
        emailVerificationToken: previous.emailVerificationToken,
        emailVerificationTokenExpiresAt: previous.emailVerificationTokenExpiresAt,
      },
    );
    return result.affected === 1;
  }

  async recordDeleteAccountRequest(userId: number, request: DeleteAccountRequest): Promise<void> {
    await this.source.getRepository(User).update(userId, {
      deleteAccountToken: request.tokenHash,
      deleteAccountTokenExpiresAt: request.expiresAt,
      deleteAccountRequestedAt: request.requestedAt,
    });
  }

  async findForDeletionConfirmation(email: string, tokens: string[]): Promise<UserRecord | null> {
    const repository = this.source.getRepository(User);
    const byEmail = await repository.findOne({ where: { email }, withDeleted: true });
    if (byEmail?.deleteAccountToken && tokens.includes(byEmail.deleteAccountToken)) return toUserRecord(byEmail);

    // The email is anonymized on deletion and may be reused: the retained token still identifies the confirmation.
    const byToken = await repository.findOne({
      where: { deleteAccountToken: In(tokens), deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    const found = byToken ?? byEmail;
    return found ? toUserRecord(found) : null;
  }

  async anonymizeUser(
    userId: number,
    identity: UserIdentity,
    context?: TransactionContext,
  ): Promise<AnonymizeUserOutcome> {
    return this.tx.run(context, async (manager) => {
      const repository = manager.getRepository(User);
      const user = await repository.findOne({ where: { id: userId }, withDeleted: true });
      if (!user) return { outcome: 'not-found' };
      if (user.deletedAt) return { outcome: 'already-deleted' };

      const activeUsage = await manager
        .getRepository(ResourceUsage)
        .findOne({ where: { userId: user.id, endTime: IsNull() } });
      if (activeUsage) return { outcome: 'active-usage' };

      await manager.getRepository(AuthenticationDetail).delete({ userId: user.id });
      await manager.getRepository(Session).delete({ userId: user.id });
      // The user row stays (soft delete), so its ON DELETE CASCADE never removes the dashboard pins.
      await manager.getRepository(DashboardPin).delete({ userId: user.id });
      await repository.update(user.id, {
        username: identity.username,
        email: identity.email,
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        externalIdentifier: null,
        firstName: null,
        lastName: null,
        nfcKeySeedToken: null,
        lastUsernameChangeAt: null,
      });
      await repository.softDelete(user.id);
      return { outcome: 'anonymized', locale: user.locale };
    });
  }
}
