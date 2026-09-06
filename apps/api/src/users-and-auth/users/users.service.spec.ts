import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticationDetail, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { DataSource, EntityManager, Repository, UpdateResult } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { LicenseService } from '../../license/license.service';
import { EmailService } from '../../email/email.service';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { TokenHashService } from '../../encryption/token-hash.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';

const mockMetricsService = {
  usersRegisteredTotal: { inc: jest.fn() },
  usersTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  usersLocaleSyncsTotal: { inc: jest.fn() },
  usersPerLocale: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

const mockRbacService = {
  assignRoleByKey: jest.fn().mockResolvedValue(undefined),
  assignDefaultRoles: jest.fn().mockResolvedValue(undefined),
  isLastAdministrator: jest.fn().mockResolvedValue(false),
};

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;
  let emailService: { sendUsernameChangedEmail: jest.Mock };

  beforeEach(async () => {
    mockRbacService.assignRoleByKey.mockClear();
    mockRbacService.assignDefaultRoles.mockClear();
    mockRbacService.isLastAdministrator.mockClear();
    mockRbacService.isLastAdministrator.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendUsernameChangedEmail: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            // Call the callback with a mock EntityManager that delegates save() to
            // userRepository.save so per-test mocks on the repository still apply.
            transaction: jest.fn().mockImplementation(async (cb: (em: unknown) => Promise<unknown>) => {
              const em = {
                save: jest.fn().mockImplementation((entity: unknown) => userRepository.save(entity as User)),
              };
              return cb(em);
            }),
          },
        },
        {
          provide: TokenHashService,
          useValue: {
            hashToken: jest.fn((token: string) => `hashed:${token}`),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            findAndCount: jest.fn(),
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AuthenticationDetail),
          useValue: {
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Session),
          useValue: {
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: {
            count: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: RbacService,
          useValue: mockRbacService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
    dataSource = module.get(DataSource) as jest.Mocked<DataSource>;
    emailService = module.get(EmailService) as unknown as { sendUsernameChangedEmail: jest.Mock };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should validate options using Zod', async () => {
      await expect(service.findOne({})).rejects.toThrow('At least one search criteria must be provided');
    });

    it('should find a user by id', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ id: 1 });
      expect(result).toEqual(user);
    });

    it('should find a user by username', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ username: 'test' });
      expect(result).toEqual(user);
    });

    it('should find a user by email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findOne({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should validate email format', async () => {
      await expect(service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('rollbackFailedRegistration', () => {
    it('hard-deletes the unregistered user without updating user metrics', async () => {
      const manager = { delete: jest.fn().mockResolvedValue(undefined) };
      dataSource.transaction.mockImplementation(async (isolationOrCallback, suppliedCallback) => {
        const callback = typeof isolationOrCallback === 'function' ? isolationOrCallback : suppliedCallback;
        if (!callback) throw new Error('Missing transaction callback');
        return callback(manager as unknown as EntityManager);
      });

      await service.rollbackFailedRegistration(14);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(User, 14);
      expect(mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.usersPerLocale.dec).not.toHaveBeenCalled();
    });
  });

  describe('createOne', () => {
    it('the first created user should be assigned the administrator role via RBAC', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(
        async (data) =>
          ({
            id: 1,
            username: 'test',
            email: 'test@example.com',
            externalIdentifier: null,
            ...data,
          }) as User,
      );
      jest.spyOn(userRepository, 'count').mockResolvedValue(0);

      await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'administrator', expect.anything());
    });

    it('a subsequent user should be assigned default roles via RBAC', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => {
        return { id: 1, ...data } as unknown as User;
      });
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      const result = await service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(result).toEqual({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        isEmailVerified: false,
      });
      expect(mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, expect.anything());
      expect(mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValueOnce({ id: 1 } as User);

      await expect(
        service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 1 } as User); // username check

      await expect(
        service.createOne({ username: 'existing', email: 'test@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildUsernameFromSSOClaim', () => {
    it('normalizes usernames from SSO claims', () => {
      const result = service.buildUsernameFromSSOClaim('Name Surname');
      expect(result).toBe('name.surname');
    });

    it('falls back to alternate claim when primary is invalid', () => {
      const result = service.buildUsernameFromSSOClaim('@@@', 'Jane Doe');
      expect(result).toBe('jane.doe');
    });

    it('generates a safe fallback when no candidates are usable', () => {
      const result = service.buildUsernameFromSSOClaim('@@@', ' ');
      expect(result).toMatch(/^sso-user-[a-z0-9_-]{8}$/);
    });
  });

  describe('updateUser', () => {
    it('should update allowed fields and trim values', async () => {
      const updatedUser = {
        id: 1,
        externalIdentifier: 'ext-updated',
      } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(updatedUser);

      const result = await service.updateOne(1, { externalIdentifier: '  ext-updated  ' });

      expect(userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ externalIdentifier: 'ext-updated' }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should update verification tokens', async () => {
      const updatedUser = {
        id: 1,
        emailVerificationToken: 'token',
        emailVerificationTokenExpiresAt: new Date(),
      } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(updatedUser);

      const tokenExpiry = new Date();
      const result = await service.updateOne(1, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          emailVerificationToken: 'token',
          emailVerificationTokenExpiresAt: tokenExpiry,
        }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should throw if user not found after update', async () => {
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(UserNotFoundException);
    });
  });

  describe('findMany', () => {
    it('should return paginated users', async () => {
      const mockUsers = [
        {
          id: 1,
          username: 'user1',
          email: 'user1@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          lastUsernameChangeAt: null,
          deleteAccountToken: null,
          deleteAccountTokenExpiresAt: null,
          deleteAccountRequestedAt: null,
          deletedAt: null,
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          nfcKeySeedToken: null,
          ownedProjects: [],
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
          billingFactor: 100,
          projectMemberships: [],
          sentProjectInvitations: [],
          receivedProjectInvitations: [],
          formSubmissions: [],
          lockedUntil: null,
          failedLoginAttempts: 0,
          firstFailedLoginAt: null,
          locale: 'en',
        } as unknown as User,
        {
          id: 2,
          username: 'user2',
          email: 'user2@example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
          isEmailVerified: false,
          emailVerificationToken: null,
          emailVerificationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          lastUsernameChangeAt: null,
          deleteAccountToken: null,
          deleteAccountTokenExpiresAt: null,
          deleteAccountRequestedAt: null,
          deletedAt: null,
          resourceIntroductions: [],
          resourceUsages: [],
          resourceIntroducers: [],
          groupMemberships: [],
          nfcCards: [],
          authenticationDetails: [],
          resourceIntroducerPermissions: [],
          externalIdentifier: null,
          nfcKeySeedToken: null,
          ownedProjects: [],
          sessions: [],
          billingTransactions: [],
          initiatedBillingTransactions: [],
          creditBalance: 0,
          billingFactor: 100,
          projectMemberships: [],
          sentProjectInvitations: [],
          receivedProjectInvitations: [],
          formSubmissions: [],
          lockedUntil: null,
          failedLoginAttempts: 0,
          firstFailedLoginAt: null,
          locale: 'en',
        } as unknown as User,
      ];

      userRepository.findAndCount.mockResolvedValue([mockUsers, 2]);

      const result = await service.findMany({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockUsers);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(userRepository.findAndCount).toHaveBeenCalled();
    });

    it('should order users by username ascending', async () => {
      userRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMany({ page: 1, limit: 10 });

      expect(userRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ order: { username: 'ASC' } }));
    });

    it('should filter users by role assignment', async () => {
      userRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMany({ page: 1, limit: 10, roleId: 42 });

      expect(userRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userRoles: { roleId: 42 } } }),
      );
    });

    it('should retain the role assignment filter when searching', async () => {
      userRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findMany({ page: 1, limit: 10, roleId: 42, search: 'alice' });

      expect(userRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.arrayContaining([expect.objectContaining({ userRoles: { roleId: 42 } })]),
        }),
      );
    });

    it('should require every selected role when roleMatch is all', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const roleFilter = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT role user IDs)'),
      };
      query.subQuery.mockReturnValue(roleFilter);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, roleIds: [2, 2, 4], roleMatch: 'all' });

      expect(roleFilter.having).toHaveBeenCalledWith('COUNT(DISTINCT userRole.roleId) = :roleCount');
      expect(query.andWhere).toHaveBeenCalledWith('user.id IN (SELECT role user IDs)', {
        roleIds: [2, 4],
        roleCount: 2,
      });
    });

    it('should exclude users assigned any selected role', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const excludedRoles = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT excluded role user IDs)'),
      };
      query.subQuery.mockReturnValue(excludedRoles);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, excludeRoleIds: [2, 2, 4] });

      expect(query.andWhere).toHaveBeenCalledWith('NOT EXISTS (SELECT excluded role user IDs)', {
        excludeRoleIds: [2, 4],
      });
    });

    it('should combine selected SSO providers with no SSO users for an any match', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        setParameters: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const noSsoProvider = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT no SSO provider)'),
      };
      const ssoProviders = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT selected SSO providers)'),
      };
      query.subQuery.mockReturnValueOnce(noSsoProvider).mockReturnValueOnce(ssoProviders);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, ssoProviderIds: [7], ssoProviderNone: true });

      expect(query.andWhere).toHaveBeenCalledWith(expect.anything());
      expect(query.setParameters).toHaveBeenCalledWith({
        ssoType: 'sso',
        ssoProviderIds: [7],
        ssoProviderCount: 1,
      });
    });

    it('should deduplicate SSO providers before applying an all match', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        setParameters: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const ssoProviders = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT selected SSO providers)'),
      };
      query.subQuery
        .mockReturnValueOnce({
          select: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getQuery: jest.fn().mockReturnValue('(SELECT no SSO provider)'),
        })
        .mockReturnValueOnce(ssoProviders);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, ssoProviderIds: [7, 7], ssoProviderMatch: 'all' });

      expect(ssoProviders.having).toHaveBeenCalledWith('COUNT(DISTINCT ssoDetail.providerId) = :ssoProviderCount');
      expect(query.setParameters).toHaveBeenCalledWith({
        ssoType: 'sso',
        ssoProviderIds: [7],
        ssoProviderCount: 1,
      });
    });

    it('should exclude users linked to any selected SSO provider', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const excludedSsoProviders = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT excluded SSO providers)'),
      };
      query.subQuery.mockReturnValue(excludedSsoProviders);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, excludeSsoProviderIds: [7, 7] });

      expect(query.andWhere).toHaveBeenCalledWith('NOT EXISTS (SELECT excluded SSO providers)', {
        excludedSsoType: 'sso',
        excludeSsoProviderIds: [7],
      });
    });

    it('should require users with an SSO provider', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        subQuery: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      const ssoProviderExists = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT any SSO provider)'),
      };
      query.subQuery.mockReturnValue(ssoProviderExists);
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, hasSsoProvider: true });

      expect(query.andWhere).toHaveBeenCalledWith('EXISTS (SELECT any SSO provider)', {
        anySsoType: 'sso',
      });
    });

    it('should filter by email verification status', async () => {
      const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userRepository.createQueryBuilder.mockReturnValue(query as never);

      await service.findMany({ page: 1, limit: 10, emailVerified: true });

      expect(query.andWhere).toHaveBeenCalledWith('user.isEmailVerified = :emailVerified', { emailVerified: true });
    });

    it('should throw error for invalid pagination options', async () => {
      await expect(service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
      await expect(service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
    });
  });

  describe('changeUsername', () => {
    beforeEach(() => {
      jest.spyOn(service, 'isSSOUser').mockResolvedValue(false);
    });

    const baseUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 1,
        username: 'olduser',
        email: 'user@example.com',

        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        lastUsernameChangeAt: null,
        resourceIntroductions: [],
        resourceUsages: [],
        resourceIntroducers: [],
        groupMemberships: [],
        nfcCards: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
        externalIdentifier: null,
        nfcKeySeedToken: null,
        ownedProjects: [],
        sessions: [],
        ...overrides,
      }) as User;

    it('should throw if target user not found', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(null);

      await expect(service.changeUsername(123, 'newuser', baseUser())).rejects.toThrow(UserNotFoundException);
    });

    it("should forbid changing another user's username without permission", async () => {
      const target = baseUser({ id: 2 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(target);

      await expect(service.changeUsername(2, 'newuser', baseUser({ id: 1 }))).rejects.toThrow(ForbiddenException);
    });

    it('should enforce once-per-day limit for self-change when not admin', async () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const me = baseUser({ id: 10, lastUsernameChangeAt: recent });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      await expect(service.changeUsername(10, 'newuser', me)).rejects.toThrow(BadRequestException);
    });

    it('should allow self-change and update lastUsernameChangeAt and send email', async () => {
      const me = baseUser({ id: 10, username: 'me' });
      const updated = { ...me, username: 'newuser', lastUsernameChangeAt: new Date() } as User;
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await service.changeUsername(10, 'newuser', me);

      expect(updateSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          username: 'newuser',
          lastUsernameChangeAt: expect.any(Date),
        }),
      );
      expect(emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'me');
      expect(result).toBe(updated);
    });

    it("should allow admin to change another user's username without altering lastUsernameChangeAt", async () => {
      const target = baseUser({ id: 20, username: 'target', lastUsernameChangeAt: null });
      const admin = baseUser({
        id: 1,
        effectivePermissions: new Set(['users.update']),
      } as never);
      const updated = { ...target, username: 'new_admin_set', lastUsernameChangeAt: null } as User;
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(target).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await service.changeUsername(20, 'new_admin_set', admin);

      expect(updateSpy).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          username: 'new_admin_set',
        }),
      );
      expect(emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'target');
      expect(result).toBe(updated);
    });

    it('should validate new username format', async () => {
      const me = baseUser({ id: 10 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);

      await expect(service.changeUsername(10, 'x', me)).rejects.toThrow(BadRequestException);
    });

    it('should forbid changing username for SSO users', async () => {
      const me = baseUser({ id: 5 });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(me);
      jest.spyOn(service, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(service.changeUsername(5, 'newuser', me)).rejects.toThrow(SSOUsernameChangeForbiddenException);
    });
  });

  describe('createOne – locale', () => {
    beforeEach(() => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);
      jest.spyOn(userRepository, 'save').mockImplementation(async (data) => ({ id: 99, ...data }) as User);
    });

    it('sets locale when provided', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'de' });
      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de' }));
      expect(mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });

    it('stores the full BCP 47 locale tag without lowercasing or truncating', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'ZH-Hant-TW' });
      expect(userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ZH-Hant-TW' }));
    });

    it('leaves locale at column default when not provided', async () => {
      await service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      const saved = (userRepository.save as jest.Mock).mock.calls[0][0] as Partial<User>;
      expect(saved.locale).toBeUndefined();
    });
  });

  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const existing = { id: 1, locale: 'en' } as User;
      const updated = { id: 1, locale: 'de' } as User;
      jest.spyOn(userRepository, 'update').mockResolvedValue({} as UpdateResult);
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

      const result = await service.updateLocale(1, 'de-DE');
      expect(userRepository.update).toHaveBeenCalledWith(1, { locale: 'de-DE' });
      expect(mockMetricsService.usersLocaleSyncsTotal.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
      expect(mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(result).toEqual(updated);
    });

    it('throws BadRequestException for empty locale', async () => {
      await expect(service.updateLocale(1, '   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmSelfDeletion', () => {
    const futureDate = new Date(Date.now() + 86_400_000);

    it('throws ForbiddenException when user is the last administrator', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        id: 1,
        email: 'admin@example.com',
        deletedAt: null,
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      } as unknown as User);
      mockRbacService.isLastAdministrator.mockResolvedValue(true);

      await expect(service.confirmSelfDeletion('admin@example.com', 'tok')).rejects.toThrow(ForbiddenException);
    });

    it('treats a repeated confirmation as success after the email has been reused', async () => {
      const reusedEmailUser = {
        id: 2,
        deletedAt: null,
        deleteAccountToken: 'hashed:different-token',
        deleteAccountTokenExpiresAt: futureDate,
      } as User;
      const deletedUser = {
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      } as User;
      userRepository.findOne.mockResolvedValueOnce(reusedEmailUser).mockResolvedValueOnce(deletedUser);

      await expect(service.confirmSelfDeletion('deleted@example.com', 'tok')).resolves.toBeUndefined();

      expect(userRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          deleteAccountToken: expect.anything(),
          deletedAt: expect.anything(),
        }),
        withDeleted: true,
      });
    });

    it('rejects an expired confirmation token for a deleted account', async () => {
      const deletedUser = {
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: new Date(Date.now() - 1_000),
      } as User;
      userRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedUser);

      await expect(service.confirmSelfDeletion('deleted@example.com', 'tok')).rejects.toThrow(
        'DeleteAccountTokenExpiredException',
      );
    });

    it('retains confirmation token evidence while confirming an account deletion', async () => {
      const user = {
        id: 1,
        locale: 'en',
        deletedAt: null,
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
        deleteAccountRequestedAt: new Date(),
      } as User;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const usageRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const authRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
      const sessionRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === User) return userRepo;
          if (entity === ResourceUsage) return usageRepo;
          if (entity === AuthenticationDetail) return authRepo;
          return sessionRepo;
        }),
      } as unknown as EntityManager;
      dataSource.transaction.mockImplementation(async (isolationOrCallback, suppliedCallback) => {
        const callback = typeof isolationOrCallback === 'function' ? isolationOrCallback : suppliedCallback;
        if (!callback) throw new Error('Missing transaction callback');
        return callback(manager);
      });

      userRepository.findOne.mockResolvedValue(user);

      await service.confirmSelfDeletion('deleted@example.com', 'tok');

      expect(userRepo.update).toHaveBeenCalledWith(
        1,
        expect.not.objectContaining({
          deleteAccountToken: expect.anything(),
          deleteAccountTokenExpiresAt: expect.anything(),
          deleteAccountRequestedAt: expect.anything(),
        }),
      );
    });
  });
});
