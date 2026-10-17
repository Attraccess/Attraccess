import { toApplicationRecord } from '../../../database/sqlite/backend';
import {
  AccountWriteConflictError,
  NewUserAccount,
  UserAccountChanges,
  UserListOptions,
  UserLookup,
  UserOperations,
  UserPersistence,
  UserRelations,
} from './port';
import {
  Setting,
  User,
  Role,
  AuthenticationDetail,
  AuthenticationType,
  ResourceUsage,
  Session,
  SSOProviderType,
  UserRole,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Not,
  QueryFailedError,
  Raw,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { SignupDomainPersistence } from './port';

@Injectable()
export class TypeormSignupDomainPersistence extends SignupDomainPersistence {
  constructor(@InjectRepository(Setting) private readonly settings: Repository<Setting>) {
    super();
  }
  async readWhitelist(): Promise<string | null> {
    return (
      (await this.settings.findOne({ where: { parent: 'auth', key: 'local_signup_domain_whitelist' } }))?.value ?? null
    );
  }
  async updateWhitelist(value: string): Promise<void> {
    await this.settings.update({ parent: 'auth', key: 'local_signup_domain_whitelist' }, { value });
  }
}

@Injectable()
export class TypeormUserPersistence extends UserPersistence {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthenticationDetail) private readonly authentication: Repository<AuthenticationDetail>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    private readonly transaction?: EntityManager,
  ) {
    super();
  }
  async account(lookup: UserLookup, relations?: UserRelations, includeDeleted = false): Promise<User | null> {
    return toApplicationRecord(
      await this.users.findOne({
        where: lookup,
        relations: relations ? [...relations] : undefined,
        ...(includeDeleted ? { withDeleted: true } : {}),
      }),
    );
  }
  async count(excludedUserId?: number): Promise<number> {
    return this.users.count(excludedUserId === undefined ? undefined : { where: { id: Not(excludedUserId) } });
  }
  async createAccount(input: NewUserAccount): Promise<User> {
    return this.persist(async () =>
      toApplicationRecord(
        await (this.transaction
          ? this.transaction.save(this.users.create(input))
          : this.users.save(this.users.create(input))),
      ),
    );
  }
  async createAccounts(input: readonly NewUserAccount[]): Promise<User[]> {
    return this.persist(async () =>
      toApplicationRecord(await this.users.save(input.map((row) => this.users.create(row)))),
    );
  }
  async patchAccount(userId: number, changes: UserAccountChanges): Promise<void> {
    await this.persist(() => this.users.update(userId, changes));
  }
  async hardDeleteAccount(userId: number): Promise<void> {
    if (this.transaction) await this.transaction.delete(User, userId);
    else await this.users.delete(userId);
  }
  async firstAccount(): Promise<User | null> {
    return toApplicationRecord((await this.users.find({ take: 1 }))[0] ?? null);
  }
  async claimSetupAccount(userId: number, username: string, email: string): Promise<boolean> {
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ username, email })
      .where('id = :id', { id: userId })
      .andWhere('isEmailVerified = :isEmailVerified', { isEmailVerified: false })
      .andWhere('NOT EXISTS (SELECT 1 FROM user AS other WHERE other.id != :id AND other.deletedAt IS NULL)')
      .execute();
    return result.affected === 1;
  }
  async roleForImport(key: string): Promise<Role | null> {
    return toApplicationRecord(
      await (this.transaction ?? this.users.manager)
        .getRepository(Role)
        .findOne({ where: { key }, relations: ['rolePermissions'] }),
    );
  }
  async hasOpenUsage(userId: number): Promise<boolean> {
    return !!(await this.usages.findOne({ where: { userId, endTime: IsNull() } }));
  }
  async removeAuthentication(userId: number): Promise<void> {
    await this.authentication.delete({ userId });
  }
  async removeSessions(userId: number): Promise<void> {
    await this.sessions.delete({ userId });
  }
  async softDeleteAccount(userId: number): Promise<void> {
    await this.users.softDelete(userId);
  }
  async ssoUser(userId: number): Promise<boolean> {
    return !!(await this.users
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .leftJoin('user.authenticationDetails', 'authenticationDetails')
      .andWhere('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
      .getOne());
  }
  async bySso(providerType: SSOProviderType, providerId: number, subject: string): Promise<User | null> {
    return toApplicationRecord(
      await this.users
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails')
        .where('authenticationDetails.type = :type', { type: AuthenticationType.SSO })
        .andWhere('authenticationDetails.providerType = :providerType', { providerType })
        .andWhere('authenticationDetails.providerId = :providerId', { providerId })
        .andWhere('authenticationDetails.ssoSubject = :subject', { subject })
        .getOne(),
    );
  }
  async byEmailsOrUsernames(emails: readonly string[], usernames: readonly string[]): Promise<User[]> {
    const where: FindOptionsWhere<User>[] = [];
    if (emails.length) where.push({ email: In([...emails]) });
    if (usernames.length) where.push({ username: In([...usernames]) });
    return where.length ? toApplicationRecord(await this.users.find({ where })) : [];
  }
  async caseInsensitiveEmailMatches(email: string): Promise<User[]> {
    return toApplicationRecord(
      await this.users.find({
        where: {
          email: Raw((alias) => `LOWER(${alias}) = :loginEmail`, { loginEmail: email.toLowerCase() }),
        },
        take: 2,
      }),
    );
  }
  async deletedAccountByTokens(tokens: readonly string[]): Promise<User | null> {
    return toApplicationRecord(
      await this.users.findOne({
        where: { deleteAccountToken: In([...tokens]), deletedAt: Not(IsNull()) },
        withDeleted: true,
      }),
    );
  }
  async page(options: UserListOptions): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const { search, page, limit } = options;
    const skip = (page - 1) * limit;
    const hasAdvancedFilters =
      options.roleIds !== undefined ||
      options.excludeRoleIds !== undefined ||
      options.emailVerified !== undefined ||
      options.ssoProviderIds !== undefined ||
      options.excludeSsoProviderIds !== undefined ||
      options.ssoProviderNone !== undefined ||
      options.hasSsoProvider !== undefined;

    if (hasAdvancedFilters) {
      const query = this.users.createQueryBuilder('user');
      query.leftJoinAndSelect('user.authenticationDetails', 'authenticationDetails');

      if (options.includeRoles) {
        query.leftJoinAndSelect('user.userRoles', 'userRoles').leftJoinAndSelect('userRoles.role', 'role');
      }

      if (options.ids) {
        query.andWhere('user.id IN (:...ids)', { ids: options.ids });
      }

      if (options.emailVerified !== undefined) {
        query.andWhere('user.isEmailVerified = :emailVerified', { emailVerified: options.emailVerified });
      }

      this.applyRoleFilters(query, options);

      this.applySsoFilters(query, options);

      if (search) {
        query.andWhere(
          new Brackets((where) =>
            where.where('LOWER(user.username) LIKE LOWER(:search)').orWhere('LOWER(user.email) LIKE LOWER(:search)'),
          ),
          { search: `%${search}%` },
        );
      }

      const [users, total] = await query.orderBy('user.username', 'ASC').skip(skip).take(limit).getManyAndCount();
      return { data: toApplicationRecord(users), total, page, limit };
    }

    let whereCondition: FindOptionsWhere<User>[] | FindOptionsWhere<User> = {};

    if (Array.isArray(options.ids)) {
      whereCondition = { id: In(options.ids) };
    }

    if (options.roleId !== undefined) {
      whereCondition = { ...whereCondition, userRoles: { roleId: options.roleId } };
    }

    if (search) {
      whereCondition = [
        { ...whereCondition, username: ILike(`%${search}%`) },
        { ...whereCondition, email: ILike(`%${search}%`) },
      ];
    }

    const [users, total] = await this.users.findAndCount({
      skip,
      take: limit,
      where: whereCondition,
      relations: options.includeRoles
        ? ['authenticationDetails', 'userRoles', 'userRoles.role']
        : ['authenticationDetails'],
      order: { username: 'ASC' },
    });

    return {
      data: toApplicationRecord(users),
      total,
      page: page,
      limit: limit,
    };
  }
  private applyRoleFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const requestedRoleIds = options.roleIds ?? (options.roleId === undefined ? undefined : [options.roleId]);
    const roleIds = requestedRoleIds ? [...new Set(requestedRoleIds)] : undefined;
    if (roleIds?.length) {
      const roleFilter = query
        .subQuery()
        .select('userRole.userId')
        .from(UserRole, 'userRole')
        .where('userRole.roleId IN (:...roleIds)');

      if (options.roleMatch === 'all') {
        roleFilter.groupBy('userRole.userId').having('COUNT(DISTINCT userRole.roleId) = :roleCount');
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds, roleCount: roleIds.length });
      } else {
        query.andWhere(`user.id IN ${roleFilter.getQuery()}`, { roleIds });
      }
    }

    const excludeRoleIds = options.excludeRoleIds ? [...new Set(options.excludeRoleIds)] : undefined;
    if (excludeRoleIds?.length) {
      const excludedRoles = query
        .subQuery()
        .select('1')
        .from(UserRole, 'excludedUserRole')
        .where('excludedUserRole.userId = user.id')
        .andWhere('excludedUserRole.roleId IN (:...excludeRoleIds)');
      query.andWhere(`NOT EXISTS ${excludedRoles.getQuery()}`, { excludeRoleIds });
    }
  }

  private applySsoFilters(query: SelectQueryBuilder<User>, options: UserListOptions): void {
    const ssoProviderIds = options.ssoProviderIds ? [...new Set(options.ssoProviderIds)] : undefined;
    if (ssoProviderIds?.length || options.ssoProviderNone) {
      const noSsoProvider = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'ssoDetail')
        .where('ssoDetail.userId = user.id')
        .andWhere('ssoDetail.type = :ssoType')
        .getQuery();
      const ssoProviders = ssoProviderIds?.length
        ? query
            .subQuery()
            .select('ssoDetail.userId')
            .from(AuthenticationDetail, 'ssoDetail')
            .where('ssoDetail.userId = user.id')
            .andWhere('ssoDetail.type = :ssoType')
            .andWhere('ssoDetail.providerId IN (:...ssoProviderIds)')
        : undefined;

      if (ssoProviders && options.ssoProviderMatch === 'all') {
        ssoProviders.groupBy('ssoDetail.userId').having('COUNT(DISTINCT ssoDetail.providerId) = :ssoProviderCount');
      }

      if (ssoProviders && options.ssoProviderNone && options.ssoProviderMatch !== 'all') {
        query.andWhere(
          new Brackets((where) =>
            where.where(`user.id IN ${ssoProviders.getQuery()}`).orWhere(`NOT EXISTS ${noSsoProvider}`),
          ),
        );
      } else if (ssoProviders) {
        query.andWhere(`user.id IN ${ssoProviders.getQuery()}`);
        if (options.ssoProviderNone) {
          query.andWhere(`NOT EXISTS ${noSsoProvider}`);
        }
      } else {
        query.andWhere(`NOT EXISTS ${noSsoProvider}`);
      }

      query.setParameters({
        ssoType: AuthenticationType.SSO,
        ...(ssoProviderIds?.length ? { ssoProviderIds, ssoProviderCount: ssoProviderIds.length } : {}),
      });
    }

    if (options.hasSsoProvider !== undefined) {
      const ssoProviderExists = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'anySsoDetail')
        .where('anySsoDetail.userId = user.id')
        .andWhere('anySsoDetail.type = :anySsoType');
      query.andWhere(`${options.hasSsoProvider ? 'EXISTS' : 'NOT EXISTS'} ${ssoProviderExists.getQuery()}`, {
        anySsoType: AuthenticationType.SSO,
      });
    }

    const excludeSsoProviderIds = options.excludeSsoProviderIds
      ? [...new Set(options.excludeSsoProviderIds)]
      : undefined;
    if (excludeSsoProviderIds?.length) {
      const excludedSsoProviders = query
        .subQuery()
        .select('1')
        .from(AuthenticationDetail, 'excludedSsoDetail')
        .where('excludedSsoDetail.userId = user.id')
        .andWhere('excludedSsoDetail.type = :excludedSsoType')
        .andWhere('excludedSsoDetail.providerId IN (:...excludeSsoProviderIds)');
      query.andWhere(`NOT EXISTS ${excludedSsoProviders.getQuery()}`, {
        excludedSsoType: AuthenticationType.SSO,
        excludeSsoProviderIds,
      });
    }
  }

  isWriteConflict(error: unknown): boolean {
    if (error instanceof AccountWriteConflictError) return true;
    if (!(error instanceof QueryFailedError)) return false;
    const driver = error.driverError as { code?: string | number; errno?: number; message?: unknown };
    const code = driver?.code ?? driver?.errno;
    const message = driver?.message;
    return (
      ['23505', 'SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_UNIQUE', 'ER_DUP_ENTRY', 1062].includes(code ?? '') ||
      (typeof message === 'string' &&
        message.toLowerCase().includes('unique') &&
        message.toLowerCase().includes('email'))
    );
  }
  private async persist<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (this.isWriteConflict(error) && !(error instanceof AccountWriteConflictError)) {
        throw new AccountWriteConflictError((error as Error).message);
      }
      throw error;
    }
  }
}
export function userTransactionOperations(manager: EntityManager): UserOperations {
  return new TypeormUserPersistence(
    manager.getRepository(User),
    manager.getRepository(AuthenticationDetail),
    manager.getRepository(Session),
    manager.getRepository(ResourceUsage),
    manager,
  );
}
