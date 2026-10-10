import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { Role, User, AuthenticationDetail, ResourceUsage } from '@attraccess/database-entities';
import { EntityManager, UpdateResult, QueryFailedError } from 'typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserNotFoundException } from './../../exceptions/user.notFound.exception';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('findOne', () => {
    it('should validate options using Zod', async () => {
      await expect(fixture.service.findOne({})).rejects.toThrow('At least one search criteria must be provided');
    });

    it('should find a user by id', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ id: 1 });
      expect(result).toEqual(user);
    });

    it('should find a user by username', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ username: 'test' });
      expect(result).toEqual(user);
    });

    it('should find a user by email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should validate email format', async () => {
      await expect(fixture.service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('rollbackFailedRegistration', () => {
    it('hard-deletes the unregistered user without updating user metrics', async () => {
      const manager = { delete: jest.fn().mockResolvedValue(undefined) };
      fixture.dataSource.transaction.mockImplementation(async (callback) => callback(manager as EntityManager));

      await fixture.service.rollbackFailedRegistration(14);

      expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(User, 14);
      expect(fixture.mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.usersPerLocale.dec).not.toHaveBeenCalled();
    });
  });

  describe('createOne', () => {
    it('the first created user should be assigned the administrator role via RBAC', async () => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(fixture.userRepository, 'save').mockImplementation(
        async (data) =>
          ({
            id: 1,
            username: 'test',
            email: 'test@example.com',
            externalIdentifier: null,
            ...data,
          }) as User,
      );
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(0);

      await fixture.service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'administrator', expect.anything());
    });

    it('a subsequent user should be assigned default roles via RBAC', async () => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(fixture.userRepository, 'save').mockImplementation(async (data) => {
        return { id: 1, ...data } as User;
      });
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(1);

      const result = await fixture.service.createOne({
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
      });
      expect(result).toEqual({
        id: 1,
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        isEmailVerified: false,
        locale: 'en',
      });
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, expect.anything());
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValueOnce({ id: 1 } as User);

      await expect(
        fixture.service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      jest
        .spyOn(fixture.userRepository, 'findOne')
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 1 } as User); // username check

      await expect(
        fixture.service.createOne({ username: 'existing', email: 'test@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildUsernameFromSSOClaim', () => {
    it('normalizes usernames from SSO claims', () => {
      const result = fixture.service.buildUsernameFromSSOClaim('Name Surname');
      expect(result).toBe('name.surname');
    });

    it('falls back to alternate claim when primary is invalid', () => {
      const result = fixture.service.buildUsernameFromSSOClaim('@@@', 'Jane Doe');
      expect(result).toBe('jane.doe');
    });

    it('generates a safe fallback when no candidates are usable', () => {
      const result = fixture.service.buildUsernameFromSSOClaim('@@@', ' ');
      expect(result).toMatch(/^sso-user-[a-z0-9_-]{8}$/);
    });
  });

  describe('updateUser', () => {
    it('should update allowed fields and trim values', async () => {
      const updatedUser = {
        id: 1,
        externalIdentifier: 'ext-updated',
      } as User;
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(updatedUser);

      const result = await fixture.service.updateOne(1, { externalIdentifier: '  ext-updated  ' });

      expect(fixture.userRepository.update).toHaveBeenCalledWith(
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
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(updatedUser);

      const tokenExpiry = new Date();
      const result = await fixture.service.updateOne(1, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          emailVerificationToken: 'token',
          emailVerificationTokenExpiresAt: tokenExpiry,
        }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should throw if user not found after update', async () => {
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(null);

      await expect(fixture.service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(
        UserNotFoundException,
      );
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
        } as User,
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
        } as User,
      ];

      fixture.userRepository.findAndCount.mockResolvedValue([mockUsers, 2]);

      const result = await fixture.service.findMany({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockUsers);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
      expect(fixture.userRepository.findAndCount).toHaveBeenCalled();
    });

    it('should order users by username ascending', async () => {
      fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

      await fixture.service.findMany({ page: 1, limit: 10 });

      expect(fixture.userRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { username: 'ASC' } }),
      );
    });

    it('should filter users by role assignment', async () => {
      fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

      await fixture.service.findMany({ page: 1, limit: 10, roleId: 42 });

      expect(fixture.userRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userRoles: { roleId: 42 } } }),
      );
    });

    it('should retain the role assignment filter when searching', async () => {
      fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

      await fixture.service.findMany({ page: 1, limit: 10, roleId: 42, search: 'alice' });

      expect(fixture.userRepository.findAndCount).toHaveBeenCalledWith(
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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, roleIds: [2, 2, 4], roleMatch: 'all' });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, excludeRoleIds: [2, 2, 4] });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, ssoProviderIds: [7], ssoProviderNone: true });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, ssoProviderIds: [7, 7], ssoProviderMatch: 'all' });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, excludeSsoProviderIds: [7, 7] });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, hasSsoProvider: true });

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
      fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

      await fixture.service.findMany({ page: 1, limit: 10, emailVerified: true });

      expect(query.andWhere).toHaveBeenCalledWith('user.isEmailVerified = :emailVerified', { emailVerified: true });
    });

    it('should throw error for invalid pagination options', async () => {
      await expect(fixture.service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
      await expect(fixture.service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
    });
  });

  describe('changeUsername', () => {
    beforeEach(() => {
      jest.spyOn(fixture.service, 'isSSOUser').mockResolvedValue(false);
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
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(null);

      await expect(fixture.service.changeUsername(123, 'newuser', baseUser())).rejects.toThrow(UserNotFoundException);
    });

    it("should forbid changing another user's username without permission", async () => {
      const target = baseUser({ id: 2 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(target);

      await expect(fixture.service.changeUsername(2, 'newuser', baseUser({ id: 1 }))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should enforce once-per-day limit for self-change when not admin', async () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const me = baseUser({ id: 10, lastUsernameChangeAt: recent });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);

      await expect(fixture.service.changeUsername(10, 'newuser', me)).rejects.toThrow(BadRequestException);
    });

    it('should allow self-change and update lastUsernameChangeAt and send email', async () => {
      const me = baseUser({ id: 10, username: 'me' });
      const updated = { ...me, username: 'newuser', lastUsernameChangeAt: new Date() } as User;
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await fixture.service.changeUsername(10, 'newuser', me);

      expect(updateSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          username: 'newuser',
          lastUsernameChangeAt: expect.any(Date),
        }),
      );
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'me');
      expect(result).toBe(updated);
    });

    it("should allow admin to change another user's username without altering lastUsernameChangeAt", async () => {
      const target = baseUser({ id: 20, username: 'target', lastUsernameChangeAt: null });
      const admin = baseUser({
        id: 1,
        effectivePermissions: new Set(['users.update']),
      } as never);
      const updated = { ...target, username: 'new_admin_set', lastUsernameChangeAt: null } as User;
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(target).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await fixture.service.changeUsername(20, 'new_admin_set', admin);

      expect(updateSpy).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          username: 'new_admin_set',
        }),
      );
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'target');
      expect(result).toBe(updated);
    });

    it('should validate new username format', async () => {
      const me = baseUser({ id: 10 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);

      await expect(fixture.service.changeUsername(10, 'x', me)).rejects.toThrow(BadRequestException);
    });

    it('should forbid changing username for SSO users', async () => {
      const me = baseUser({ id: 5 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);
      jest.spyOn(fixture.service, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(fixture.service.changeUsername(5, 'newuser', me)).rejects.toThrow(
        SSOUsernameChangeForbiddenException,
      );
    });
  });

  describe('updateDateTimePreferences', () => {
    it('updates only the selected user format preferences without changing locale', async () => {
      jest
        .spyOn(fixture.service, 'findOne')
        .mockResolvedValueOnce(Object.assign(new User(), { id: 42, locale: 'de', dateTimeLocale: 'en-GB' }));
      const updated = await fixture.service.updateDateTimePreferences(42, { dateTimeLocale: ' en-gb ' });
      expect(fixture.userRepository.update).toHaveBeenCalledWith(42, { dateTimeLocale: 'en-GB' });
      expect(updated).toMatchObject({ locale: 'de', dateTimeLocale: 'en-GB' });
    });
  });

  describe('date/time locale validation and reset', () => {
    it('rejects unsupported locales before writing', async () => {
      await expect(fixture.service.updateDateTimePreferences(42, { dateTimeLocale: 'zz-ZZ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(fixture.userRepository.update).not.toHaveBeenCalled();
    });
    it('persists an explicit null without changing translation language', async () => {
      jest
        .spyOn(fixture.service, 'findOne')
        .mockResolvedValueOnce(Object.assign(new User(), { id: 42, locale: 'de', dateTimeLocale: null }));
      expect(await fixture.service.updateDateTimePreferences(42, { dateTimeLocale: null })).toMatchObject({
        locale: 'de',
        dateTimeLocale: null,
      });
      expect(fixture.userRepository.update).toHaveBeenCalledWith(42, { dateTimeLocale: null });
    });
  });

  describe('createOne – locale', () => {
    beforeEach(() => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(1);
      jest.spyOn(fixture.userRepository, 'save').mockImplementation(async (data) => ({ id: 99, ...data }) as User);
    });

    it('sets locale when provided', async () => {
      await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'de' });
      expect(fixture.userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de' }));
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });

    it('stores the full BCP 47 locale tag without lowercasing or truncating', async () => {
      await fixture.service.createOne({
        username: 'usr',
        email: 'u@x.com',
        externalIdentifier: null,
        locale: 'ZH-Hant-TW',
      });
      expect(fixture.userRepository.save).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ZH-Hant-TW' }));
    });

    it('uses the system default when no personal locale was provided', async () => {
      fixture.settingsService.getDefaultLanguage.mockResolvedValue('de');
      await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      const saved = (fixture.userRepository.save as jest.Mock).mock.calls[0][0] as Partial<User>;
      expect(saved.locale).toBe('de');
    });
  });

  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const existing = { id: 1, locale: 'en' } as User;
      const updated = { id: 1, locale: 'de' } as User;
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({} as UpdateResult);
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

      const result = await fixture.service.updateLocale(1, 'de-DE');
      expect(fixture.userRepository.update).toHaveBeenCalledWith(1, { locale: 'de-DE' });
      expect(fixture.mockMetricsService.usersLocaleSyncsTotal.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(fixture.mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(result).toEqual(updated);
    });

    it('throws BadRequestException for empty locale', async () => {
      await expect(fixture.service.updateLocale(1, '   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmSelfDeletion', () => {
    const futureDate = new Date(Date.now() + 86_400_000);

    it('throws ForbiddenException when user is the last administrator', async () => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue({
        id: 1,
        email: 'admin@example.com',
        deletedAt: null,
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      } as unknown as User);
      fixture.mockRbacService.isLastAdministrator.mockResolvedValue(true);

      await expect(fixture.service.confirmSelfDeletion('admin@example.com', 'tok')).rejects.toThrow(ForbiddenException);
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
      fixture.userRepository.findOne.mockResolvedValueOnce(reusedEmailUser).mockResolvedValueOnce(deletedUser);

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).resolves.toBeUndefined();

      expect(fixture.userRepository.findOne).toHaveBeenNthCalledWith(2, {
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
      fixture.userRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedUser);

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).rejects.toThrow(
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
      fixture.dataSource.transaction.mockImplementation(async (callback) => callback(manager));

      fixture.userRepository.findOne.mockResolvedValue(user);

      await fixture.service.confirmSelfDeletion('deleted@example.com', 'tok');

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

  describe('email changes', () => {
    const actor = Object.assign(new User(), { id: 1, email: 'old@example.com' });
    beforeEach(() => {
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(actor).mockResolvedValue(null);
    });
    it('changes and reverifies an email inside the transaction', async () => {
      const updated = Object.assign(new User(), { id: 1, email: 'new@example.com' });
      jest
        .mocked(fixture.service.findOne)
        .mockReset()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(updated);
      const manager = new EntityManager(fixture.dataSource);
      jest.spyOn(manager, 'getRepository').mockReturnValue(fixture.userRepository);
      fixture.dataSource.transaction.mockImplementation(async (workOrIsolation, work) => {
        const callback = typeof workOrIsolation === 'function' ? workOrIsolation : work;
        if (!callback) throw new Error('Missing transaction callback');
        return callback(manager);
      });
      expect(await fixture.service.changeEmail(1, ' new@example.com ', actor)).toBe(updated);
      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          email: 'new@example.com',
          isEmailVerified: false,
          emailVerificationToken: expect.any(String),
          emailVerificationTokenExpiresAt: expect.any(Date),
        }),
      );
      expect(fixture.service.findOne).toHaveBeenLastCalledWith({ id: 1 }, undefined, manager);
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(updated, expect.any(String));
    });
    it('leaves an unchanged email verified without a transaction', async () => {
      expect(await fixture.service.changeEmail(1, ' old@example.com ', actor)).toBe(actor);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it.each(['', 'invalid'])('rejects invalid email %p before reading users', async (email) => {
      await expect(fixture.service.changeEmail(1, email, actor)).rejects.toThrow(BadRequestException);
      expect(fixture.service.findOne).not.toHaveBeenCalled();
    });
    it('rejects editing another user without permission', async () => {
      await expect(fixture.service.changeEmail(2, 'new@example.com', actor)).rejects.toThrow(ForbiddenException);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it.each(['23505', 'SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_UNIQUE', 'ER_DUP_ENTRY', 1062])(
      'translates a concurrent unique constraint failure (%p)',
      async (code) => {
        fixture.dataSource.transaction.mockRejectedValue(
          new QueryFailedError('UPDATE users', [], Object.assign(new Error('duplicate'), { code })),
        );
        await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow('Email already exists');
      },
    );
    it.each([
      [
        new QueryFailedError('UPDATE users', [], new Error('UNIQUE constraint failed: user.email')),
        'Email already exists',
      ],
      [new QueryFailedError('UPDATE users', [], new Error('database unavailable')), 'database unavailable'],
      [new Error('mail delivery failed'), 'mail delivery failed'],
    ])('preserves unrelated failures and recognizes email uniqueness by message', async (error, message) => {
      fixture.dataSource.transaction.mockRejectedValue(error);
      await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow(message);
    });
  });

  describe('bulk user role assignment', () => {
    function managerForImport(totalExisting = 0, rolePermissions = ['resources.view']) {
      const roleRepo = {
        findOne: jest
          .fn()
          .mockResolvedValue({ rolePermissions: rolePermissions.map((permissionKey) => ({ permissionKey })) }),
      };
      const repo = {
        count: jest.fn().mockResolvedValue(totalExisting),
        create: jest.fn(() => new User()),
        save: jest.fn(async (users: User[]) => users.map((user, index) => Object.assign(user, { id: index + 1 }))),
      };
      const manager = {
        getRepository: jest.fn((entity) => (entity === Role ? roleRepo : repo)),
      } as unknown as EntityManager;
      return { manager, repo, roleRepo };
    }
    it('bootstraps one administrator and assigns defaults to remaining normalized users', async () => {
      const { manager } = managerForImport();
      const users = await fixture.service.createMany(
        [
          { username: ' FIRST ', email: ' first@example.com ', locale: ' de ' },
          { username: 'second', email: 'second@example.com', locale: ' ' },
        ],
        { manager, grantAllPermissionsToFirst: true },
      );
      expect(users).toEqual([
        expect.objectContaining({
          username: 'first',
          email: 'first@example.com',
          locale: 'de',
          externalIdentifier: null,
        }),
        expect.objectContaining({ username: 'second', locale: 'en' }),
      ]);
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'administrator', manager);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledTimes(1);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(2, manager);
    });
    it('assigns allowed explicit roles alongside defaults without another administrator', async () => {
      const { manager } = managerForImport(3);
      fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.view']));
      await fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'viewer' }], {
        manager,
        grantAllPermissionsToFirst: true,
        actorId: 9,
      });
      expect(fixture.mockRbacService.getEffectivePermissions).toHaveBeenCalledWith(9);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, manager);
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'viewer', manager);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalledWith(1, 'administrator', manager);
    });
    it('refuses an import role above the actor privilege ceiling', async () => {
      const { manager } = managerForImport(1, ['users.update']);
      fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.view']));
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'admin' }], {
          manager,
          actorId: 9,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });
    it('rejects an unknown role and an empty email', async () => {
      const { manager, roleRepo } = managerForImport();
      roleRepo.findOne.mockResolvedValue(null);
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'missing' }], {
          manager,
        }),
      ).rejects.toThrow("Role with key 'missing' not found");
      await expect(fixture.service.createMany([{ username: 'member', email: ' ' }], { manager })).rejects.toThrow(
        'Email is required',
      );
    });
  });
});
