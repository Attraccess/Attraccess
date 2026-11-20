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
import { DataSource, EntityManager, FindOptionsWhere, ILike, In, IsNull, Not } from 'typeorm';
import type {
  DeleteAccountRequest,
  EmailChangeSnapshot,
  UserIdentity,
  UserLookup,
  UserStore,
} from '../../../users-and-auth/users/user-store.port';
import type { TransactionContext } from '../../transaction-context';
import { TransactionContextResolver } from '../transaction-context';
import { toUserAccount, toUserRecord } from './user-mapping';
import { applyUserListFilters } from './user-list-query';
import { findRelations } from '../find-options';

/** SQLite lower-cases ASCII only, so the email search term is folded in JavaScript like the stored value. */
const foldEmail = (value: string) => value.trim().toLowerCase();

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

    if (hasAdvancedFilters(query)) {
      const builder = repository.createQueryBuilder('user');
      applyUserListFilters(builder, query);
      const [users, total] = await builder
        .orderBy('user.username', 'ASC')
        .skip(skip)
        .take(query.limit)
        .getManyAndCount();
      return { users: users.map(toUserAccount), total };
    }

    let where: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};
    if (Array.isArray(query.ids)) where = { id: In(query.ids) };
    if (query.roleId !== undefined) where = { ...where, userRoles: { roleId: query.roleId } };
    if (query.search) {
      where = [
        { ...where, username: ILike(`%${query.search}%`) },
        { ...where, email: ILike(`%${foldEmail(query.search)}%`) },
      ];
    }
    const [users, total] = await repository.findAndCount({
      skip,
      take: query.limit,
      where,
      relations: findRelations(
        query.includeRoles ? ['authenticationDetails', 'userRoles', 'userRoles.role'] : ['authenticationDetails'],
      ),
      order: { username: 'ASC' },
    });
    return { users: users.map(toUserAccount), total };
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
        entity.email = data.email;
        entity.externalIdentifier = data.externalIdentifier;
        entity.isEmailVerified = data.isEmailVerified;
        entity.locale = data.locale;
        return entity;
      });
      const saved = await repository.save(entities);
      return saved.map(toUserRecord);
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
    // The conditional update is atomic across API instances, unlike an in-process mutex or count-then-update.
    const claim = await this.manager(context)
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({ username: identity.username, email: identity.email })
      .where('id = :id', { id: userId })
      .andWhere('isEmailVerified = :isEmailVerified', { isEmailVerified: false })
      .andWhere('NOT EXISTS (SELECT 1 FROM user AS other WHERE other.id != :id AND other.deletedAt IS NULL)')
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
        nfcKeySeedToken: null,
        lastUsernameChangeAt: null,
      });
      await repository.softDelete(user.id);
      return { outcome: 'anonymized', locale: user.locale };
    });
  }
}

function hasAdvancedFilters(query: UserListQuery): boolean {
  return (
    query.roleIds !== undefined ||
    query.excludeRoleIds !== undefined ||
    query.emailVerified !== undefined ||
    query.ssoProviderIds !== undefined ||
    query.excludeSsoProviderIds !== undefined ||
    query.ssoProviderNone !== undefined ||
    query.hasSsoProvider !== undefined
  );
}
