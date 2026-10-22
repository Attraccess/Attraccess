import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { User } from '@attraccess/application-models';
import { userOperationsFake } from './persistence/operations.test-fixture';
import { AccountWriteConflictError } from './persistence/port';
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
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(user);

      const result = await fixture.service.findOne({ id: 1 });
      expect(result).toEqual(user);
    });

    it('should find a user by username', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(user);

      const result = await fixture.service.findOne({ username: 'test' });
      expect(result).toEqual(user);
    });

    it('should find a user by email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(user);

      const result = await fixture.service.findOne({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should validate email format', async () => {
      await expect(fixture.service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('rollbackFailedRegistration', () => {
    it('hard-deletes the unregistered user without updating user metrics', async () => {
      await fixture.service.rollbackFailedRegistration(14);

      expect(fixture.driver.run).toHaveBeenCalledTimes(1);
      expect(fixture.persistence.hardDeleteAccount).toHaveBeenCalledWith(14);
      expect(fixture.mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.usersPerLocale.dec).not.toHaveBeenCalled();
    });
  });

  describe('createOne', () => {
    it('the first created user should be assigned the administrator role via RBAC', async () => {
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(null);
      jest.spyOn(fixture.persistence, 'createAccount').mockImplementation(
        async (data) =>
          ({
            id: 1,
            username: 'test',
            email: 'test@example.com',
            externalIdentifier: null,
            ...data,
          }) as User,
      );
      jest.spyOn(fixture.persistence, 'count').mockResolvedValue(0);

      await fixture.service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null });
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'administrator', expect.anything());
    });

    it('a subsequent user should be assigned default roles via RBAC', async () => {
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(null);
      jest.spyOn(fixture.persistence, 'createAccount').mockImplementation(async (data) => {
        return { id: 1, ...data } as User;
      });
      jest.spyOn(fixture.persistence, 'count').mockResolvedValue(1);

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
        locale: 'und',
      });
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, expect.anything());
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      jest.spyOn(fixture.persistence, 'account').mockResolvedValueOnce({ id: 1 } as User);

      await expect(
        fixture.service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      jest
        .spyOn(fixture.persistence, 'account')
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
      jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(updatedUser);

      const result = await fixture.service.updateOne(1, { externalIdentifier: '  ext-updated  ' });

      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(
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
      jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(updatedUser);

      const tokenExpiry = new Date();
      const result = await fixture.service.updateOne(1, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          emailVerificationToken: 'token',
          emailVerificationTokenExpiresAt: tokenExpiry,
        }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should throw if user not found after update', async () => {
      jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(null);

      await expect(fixture.service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  describe('findMany', () => {
    it('returns the port page and forwards normalized selection options', async () => {
      const page = { data: [{ id: 7 } as User], total: 9, page: 2, limit: 5 };
      fixture.persistence.page.mockResolvedValue(page);
      const options = {
        page: 2,
        limit: 5,
        roleIds: [1, 2],
        roleMatch: 'all' as const,
        search: 'alice',
        emailVerified: true,
      };
      await expect(fixture.service.findMany(options)).resolves.toEqual(page);
      expect(fixture.persistence.page).toHaveBeenCalledWith(expect.objectContaining(options));
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
      const updateSpy = jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);

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
      const updateSpy = jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);

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
        .mockResolvedValueOnce(Object.assign({} as User, { id: 42, locale: 'de', dateTimeLocale: 'en-GB' }));
      const updated = await fixture.service.updateDateTimePreferences(42, { dateTimeLocale: ' en-gb ' });
      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(42, { dateTimeLocale: 'en-GB' });
      expect(updated).toMatchObject({ locale: 'de', dateTimeLocale: 'en-GB' });
    });
  });

  describe('date/time locale validation and reset', () => {
    it('rejects unsupported locales before writing', async () => {
      await expect(fixture.service.updateDateTimePreferences(42, { dateTimeLocale: 'zz-ZZ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(fixture.persistence.patchAccount).not.toHaveBeenCalled();
    });
    it('persists an explicit null without changing translation language', async () => {
      jest
        .spyOn(fixture.service, 'findOne')
        .mockResolvedValueOnce(Object.assign({} as User, { id: 42, locale: 'de', dateTimeLocale: null }));
      expect(await fixture.service.updateDateTimePreferences(42, { dateTimeLocale: null })).toMatchObject({
        locale: 'de',
        dateTimeLocale: null,
      });
      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(42, { dateTimeLocale: null });
    });
  });

  describe('createOne – locale', () => {
    beforeEach(() => {
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue(null);
      jest.spyOn(fixture.persistence, 'count').mockResolvedValue(1);
      jest
        .spyOn(fixture.persistence, 'createAccount')
        .mockImplementation(async (data) => ({ id: 99, ...data }) as User);
    });

    it('sets locale when provided', async () => {
      await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null, locale: 'de' });
      expect(fixture.persistence.createAccount).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de' }));
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });

    it('stores a supported full BCP 47 locale tag without lowercasing or truncating', async () => {
      await fixture.service.createOne({
        username: 'usr',
        email: 'u@x.com',
        externalIdentifier: null,
        locale: 'EN-Latn-GB',
      });
      expect(fixture.persistence.createAccount).toHaveBeenCalledWith(expect.objectContaining({ locale: 'EN-Latn-GB' }));
    });

    it.each(['fr-FR', 'en-!!!', 'de-u-12', '', ' '])(
      'stores unsupported preference %s as undetermined',
      async (locale) => {
        const user = await fixture.service.createOne({
          username: 'usr',
          email: 'u@x.com',
          externalIdentifier: null,
          locale,
        });
        expect(user.locale).toBe('und');
        expect(fixture.persistence.createAccount).toHaveBeenCalledWith(expect.objectContaining({ locale: 'und' }));
      },
    );

    it('leaves the personal locale undetermined when none was provided', async () => {
      fixture.settingsService.getDefaultLanguage.mockResolvedValue('de');
      await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      const saved = (fixture.persistence.createAccount as jest.Mock).mock.calls[0][0] as Partial<User>;
      expect(saved.locale).toBe('und');
    });
  });

  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const existing = { id: 1, locale: 'en' } as User;
      const updated = { id: 1, locale: 'de' } as User;
      jest.spyOn(fixture.persistence, 'patchAccount').mockResolvedValue(undefined);
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

      const result = await fixture.service.updateLocale(1, 'de-DE');
      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(1, { locale: 'de-DE' });
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
      jest.spyOn(fixture.persistence, 'account').mockResolvedValue({
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
      fixture.persistence.account.mockResolvedValueOnce(reusedEmailUser).mockResolvedValueOnce(deletedUser);

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).resolves.toBeUndefined();

      expect(fixture.persistence.deletedAccountByTokens).toHaveBeenCalledWith(['hashed:tok', 'tok']);
    });

    it('rejects an expired confirmation token for a deleted account', async () => {
      const deletedUser = {
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: new Date(Date.now() - 1_000),
      } as User;
      fixture.persistence.account.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedUser);

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
      fixture.persistence.account.mockResolvedValue(user);

      await fixture.service.confirmSelfDeletion('deleted@example.com', 'tok');

      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(
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
    const actor = Object.assign({} as User, { id: 1, email: 'old@example.com' });
    beforeEach(() => {
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(actor).mockResolvedValue(null);
    });
    it('changes and reverifies an email inside the transaction', async () => {
      const updated = Object.assign({} as User, { id: 1, email: 'new@example.com' });
      jest
        .mocked(fixture.service.findOne)
        .mockReset()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(updated);
      expect(await fixture.service.changeEmail(1, ' new@example.com ', actor)).toBe(updated);
      expect(fixture.persistence.patchAccount).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          email: 'new@example.com',
          isEmailVerified: false,
          emailVerificationToken: expect.any(String),
          emailVerificationTokenExpiresAt: expect.any(Date),
        }),
      );
      expect(fixture.service.findOne).toHaveBeenLastCalledWith(
        { id: 1 },
        undefined,
        expect.objectContaining({ backend: 'fake', resolve: expect.any(Function) }),
      );
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(updated, expect.any(String));
    });
    it('leaves an unchanged email verified without a transaction', async () => {
      expect(await fixture.service.changeEmail(1, ' old@example.com ', actor)).toBe(actor);
      expect(fixture.driver.run).not.toHaveBeenCalled();
    });
    it.each(['', 'invalid'])('rejects invalid email %p before reading users', async (email) => {
      await expect(fixture.service.changeEmail(1, email, actor)).rejects.toThrow(BadRequestException);
      expect(fixture.service.findOne).not.toHaveBeenCalled();
    });
    it('rejects editing another user without permission', async () => {
      await expect(fixture.service.changeEmail(2, 'new@example.com', actor)).rejects.toThrow(ForbiddenException);
      expect(fixture.driver.run).not.toHaveBeenCalled();
    });
    it('translates a classified persistence conflict into an email validation error', async () => {
      fixture.driver.run.mockRejectedValue(new AccountWriteConflictError('email conflict'));
      await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow('Email already exists');
    });
    it.each(['database unavailable', 'mail delivery failed'])('preserves unrelated failures: %s', async (message) => {
      fixture.driver.run.mockRejectedValue(new Error(message));
      await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow(message);
    });
  });

  describe('bulk user role assignment', () => {
    function managerForImport(totalExisting = 0, rolePermissions = ['resources.view']) {
      const operations = userOperationsFake();
      operations.count.mockResolvedValue(totalExisting);
      operations.roleForImport.mockResolvedValue({
        rolePermissions: rolePermissions.map((permissionKey) => ({ permissionKey })),
      } as never);
      return { scope: fixture.parentScope(operations), operations };
    }
    it('bootstraps one administrator and assigns defaults to remaining normalized users', async () => {
      const { scope } = managerForImport();
      const users = await fixture.service.createMany(
        [
          { username: ' FIRST ', email: ' first@example.com ', locale: ' de ' },
          { username: 'second', email: 'second@example.com', locale: ' ' },
        ],
        { manager: scope, grantAllPermissionsToFirst: true },
      );
      expect(users).toEqual([
        expect.objectContaining({
          username: 'first',
          email: 'first@example.com',
          locale: 'de',
          externalIdentifier: null,
        }),
        expect.objectContaining({ username: 'second', locale: 'und' }),
      ]);
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'administrator', scope);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledTimes(1);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(2, scope);
    });
    it.each(['fr-FR', 'en-!!!', 'de-u-12'])('keeps unsupported imported preference %s undetermined', async (locale) => {
      const { scope } = managerForImport(3);
      const [user] = await fixture.service.createMany([{ username: 'member', email: 'member@example.com', locale }], {
        manager: scope,
      });
      expect(user.locale).toBe('und');
    });
    it('assigns allowed explicit roles alongside defaults without another administrator', async () => {
      const { scope } = managerForImport(3);
      fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.view']));
      await fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'viewer' }], {
        manager: scope,
        grantAllPermissionsToFirst: true,
        actorId: 9,
      });
      expect(fixture.mockRbacService.getEffectivePermissions).toHaveBeenCalledWith(9);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(1, scope);
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(1, 'viewer', scope);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalledWith(1, 'administrator', scope);
    });
    it('refuses an import role above the actor privilege ceiling', async () => {
      const { scope } = managerForImport(1, ['users.update']);
      fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.view']));
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'admin' }], {
          manager: scope,
          actorId: 9,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });
    it('rejects an unknown role and an empty email', async () => {
      const { scope, operations } = managerForImport();
      operations.roleForImport.mockResolvedValue(null);
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'missing' }], {
          manager: scope,
        }),
      ).rejects.toThrow("Role with key 'missing' not found");
      await expect(
        fixture.service.createMany([{ username: 'member', email: ' ' }], { manager: scope }),
      ).rejects.toThrow('Email is required');
    });
  });
});
