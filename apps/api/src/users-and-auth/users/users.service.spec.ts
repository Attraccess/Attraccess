import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return { ...actual, randomBytes: jest.fn(actual.randomBytes) };
});

import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { aUserRecord } from './fakes/in-memory-user-store.test-fixture';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserNotFoundException } from './../../exceptions/user.notFound.exception';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { SSONameChangeForbiddenException } from './errors/ssoNameChangeForbidden.exception';
import { UserHasActiveUsageSessionsException } from './accounts/user-accounts';
import { randomBytes } from 'crypto';
import { fakeTransactionScope } from '../../database/fake-transaction-scope.test-fixture';

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });

  describe('findOne', () => {
    it('should validate options using Zod', async () => {
      await expect(fixture.service.findOne({})).rejects.toThrow('At least one search criteria must be provided');
    });

    it('should find a user by id, username and email', async () => {
      const [user] = fixture.store.seed({ username: 'test', email: 'test@example.com' });

      await expect(fixture.service.findOne({ id: user.id })).resolves.toMatchObject({ id: user.id });
      await expect(fixture.service.findOne({ username: ' Test ' })).resolves.toMatchObject({ id: user.id });
      await expect(fixture.service.findOne({ email: 'Test@Example.com' })).resolves.toMatchObject({ id: user.id });
      await expect(fixture.service.findOne({ id: 999 })).resolves.toBeNull();
    });

    it('asks the store for credentials only when the caller names the relation', async () => {
      const spy = jest.spyOn(fixture.store, 'findUser');
      await fixture.service.findOne({ id: 1 });
      await fixture.service.findOne({ id: 1 }, ['authenticationDetails']);
      expect(spy).toHaveBeenNthCalledWith(1, { id: 1, username: undefined, email: undefined }, false, undefined);
      expect(spy).toHaveBeenNthCalledWith(2, { id: 1, username: undefined, email: undefined }, true, undefined);
    });

    it('should validate email format', async () => {
      await expect(fixture.service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });

  describe('rollbackFailedRegistration', () => {
    it('hard-deletes the unregistered user without updating user metrics', async () => {
      const [user] = fixture.store.seed({ username: 'fresh' });

      await fixture.service.rollbackFailedRegistration(user.id);

      expect(fixture.store.users).toHaveLength(0);
      expect(fixture.mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.usersPerLocale.dec).not.toHaveBeenCalled();
    });
  });

  describe('createOne', () => {
    it('the first created user should be assigned the administrator role via RBAC', async () => {
      const user = await fixture.service.createOne({
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
      });
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(user.id, 'administrator', expect.anything());
    });

    it('a subsequent user should be assigned default roles via RBAC, inside one unit of work', async () => {
      fixture.store.seed({ username: 'first', email: 'first@example.com' });

      const result = await fixture.service.createOne({
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
      });
      expect(result).toMatchObject({
        username: 'test',
        email: 'test@example.com',
        externalIdentifier: null,
        isEmailVerified: false,
        locale: 'und',
      });
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(result.id, fixture.uow.scopes[0]);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
      expect(fixture.uow.events).toEqual(['begin', 'commit']);
    });

    it('joins the caller transaction and leaves the metrics to the caller', async () => {
      fixture.store.seed({ username: 'first', email: 'first@example.com' });
      const context = fakeTransactionScope();

      const result = await fixture.service.createOne(
        { username: 'test', email: 'test@example.com', externalIdentifier: null },
        context,
      );

      expect(fixture.uow.events).toEqual([]);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(result.id, context);
      expect(fixture.mockMetricsService.usersTotal.inc).not.toHaveBeenCalled();
    });

    it('should throw if email already exists', async () => {
      fixture.store.seed({ username: 'someone', email: 'existing@example.com' });

      await expect(
        fixture.service.createOne({ username: 'test', email: 'existing@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if username already exists', async () => {
      fixture.store.seed({ username: 'existing', email: 'someone@example.com' });

      await expect(
        fixture.service.createOne({ username: 'existing', email: 'test@example.com', externalIdentifier: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks creation with 403 when the license refuses another user', async () => {
      const { LicenseError } = jest.requireActual('../../license/license.service');
      fixture.licenseService.verifyLicense.mockRejectedValue(new LicenseError('limit reached'));

      await expect(
        fixture.service.createOne({ username: 'test', email: 'test@example.com', externalIdentifier: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.store.users).toHaveLength(0);
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
      const [user] = fixture.store.seed({});

      const result = await fixture.service.updateOne(user.id, { externalIdentifier: '  ext-updated  ' });

      expect(result.externalIdentifier).toBe('ext-updated');
    });

    it('should update verification tokens', async () => {
      const [user] = fixture.store.seed({});
      const tokenExpiry = new Date();

      const result = await fixture.service.updateOne(user.id, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(result).toMatchObject({ emailVerificationToken: 'token', emailVerificationTokenExpiresAt: tokenExpiry });
    });

    it('clears a column that is set to null and leaves omitted ones alone', async () => {
      const [user] = fixture.store.seed({ passwordResetToken: 'x', emailVerificationToken: 'keep' });

      const result = await fixture.service.updateOne(user.id, { passwordResetToken: null });

      expect(result.passwordResetToken).toBeNull();
      expect(result.emailVerificationToken).toBe('keep');
    });

    it('passes the caller transaction to the store', async () => {
      const [user] = fixture.store.seed({});
      const spy = jest.spyOn(fixture.store, 'updateUser');
      const context = fakeTransactionScope();

      await fixture.service.updateOne(user.id, { externalIdentifier: 'a' }, context);

      expect(spy).toHaveBeenCalledWith(user.id, expect.objectContaining({ externalIdentifier: 'a' }), context);
    });

    it('should throw if user not found after update', async () => {
      await expect(fixture.service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  describe('findMany', () => {
    it('should return paginated users', async () => {
      fixture.store.seed({ username: 'user1' }, { username: 'user2' });

      const result = await fixture.service.findMany({ page: 1, limit: 10 });

      expect(result.data.map((user) => user.username)).toEqual(['user1', 'user2']);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(10);
    });

    it('hands the validated pagination and every filter to the store', async () => {
      const spy = jest.spyOn(fixture.store, 'listUsers');

      await fixture.service.findMany({
        page: 2,
        limit: 5,
        roleIds: [2, 4],
        roleMatch: 'all',
        ssoProviderIds: [7],
        hasSsoProvider: true,
        emailVerified: true,
        search: 'alice',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 5,
          roleIds: [2, 4],
          roleMatch: 'all',
          ssoProviderIds: [7],
          hasSsoProvider: true,
          emailVerified: true,
          search: 'alice',
        }),
      );
    });

    it('answers an empty id filter without asking the store', async () => {
      const spy = jest.spyOn(fixture.store, 'listUsers');

      await expect(fixture.service.findMany({ page: 1, limit: 10, ids: [] })).resolves.toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('should throw error for invalid pagination options', async () => {
      await expect(fixture.service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
      await expect(fixture.service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
    });
  });

  describe('changeUsername', () => {
    beforeEach(() => {
      jest.spyOn(fixture.accounts, 'isSSOUser').mockResolvedValue(false);
    });

    it('should throw if target user not found', async () => {
      await expect(fixture.service.changeUsername(123, 'newuser', { id: 1 })).rejects.toThrow(UserNotFoundException);
    });

    it("should forbid changing another user's username without permission", async () => {
      const [target] = fixture.store.seed({ id: 2, username: 'target' });

      await expect(fixture.service.changeUsername(target.id, 'newuser', { id: 1 })).rejects.toThrow(ForbiddenException);
    });

    it('should enforce once-per-day limit for self-change when not admin', async () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const [me] = fixture.store.seed({ id: 10, lastUsernameChangeAt: recent });

      await expect(fixture.service.changeUsername(me.id, 'newuser', me)).rejects.toThrow(BadRequestException);
    });

    it('should allow self-change and update lastUsernameChangeAt and send email', async () => {
      const [me] = fixture.store.seed({ id: 10, username: 'me' });

      const result = await fixture.service.changeUsername(me.id, 'newuser', me);

      expect(result).toMatchObject({ username: 'newuser', lastUsernameChangeAt: expect.any(Date) });
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(result, 'me');
    });

    it("should allow admin to change another user's username without altering lastUsernameChangeAt", async () => {
      const [target] = fixture.store.seed({ id: 20, username: 'target', lastUsernameChangeAt: null });
      const admin = { id: 1, effectivePermissions: new Set(['users.update']) };

      const result = await fixture.service.changeUsername(target.id, 'new_admin_set', admin);

      expect(result).toMatchObject({ username: 'new_admin_set', lastUsernameChangeAt: null });
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(result, 'target');
    });

    it('does not fail the change when the notification mail cannot be sent', async () => {
      const [me] = fixture.store.seed({ id: 10, username: 'me' });
      fixture.emailService.sendUsernameChangedEmail.mockRejectedValue(new Error('smtp down'));

      await expect(fixture.service.changeUsername(me.id, 'newuser', me)).resolves.toMatchObject({
        username: 'newuser',
      });
    });

    it('should validate new username format', async () => {
      const [me] = fixture.store.seed({ id: 10 });

      await expect(fixture.service.changeUsername(me.id, 'x', me)).rejects.toThrow(BadRequestException);
    });

    it('should forbid changing username for SSO users', async () => {
      const [me] = fixture.store.seed({ id: 5 });
      jest.spyOn(fixture.accounts, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(fixture.service.changeUsername(me.id, 'newuser', me)).rejects.toThrow(
        SSOUsernameChangeForbiddenException,
      );
    });
  });

  describe('changeName', () => {
    it('stores trimmed names and turns blanks into null', async () => {
      const [me] = fixture.store.seed({ id: 12 });

      const named = await fixture.service.changeName(me.id, { firstName: '  Ada ', lastName: ' Lovelace' });
      expect(named).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });

      const cleared = await fixture.service.changeName(me.id, { firstName: '   ', lastName: null });
      expect(cleared).toMatchObject({ firstName: null, lastName: null });
    });

    it('forbids changing the name of SSO users', async () => {
      const [me] = fixture.store.seed({ id: 13 });
      jest.spyOn(fixture.accounts, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(fixture.service.changeName(me.id, { firstName: 'Ada', lastName: null })).rejects.toThrow(
        SSONameChangeForbiddenException,
      );
    });

    it('rejects an unknown user', async () => {
      await expect(fixture.service.changeName(404, { firstName: 'Ada', lastName: null })).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  describe('updateDateTimePreferences', () => {
    it('updates only the selected user format preferences without changing locale', async () => {
      const [user] = fixture.store.seed({ id: 42, locale: 'de', dateTimeLocale: null });

      const updated = await fixture.service.updateDateTimePreferences(user.id, { dateTimeLocale: ' en-gb ' });

      expect(updated).toMatchObject({ locale: 'de', dateTimeLocale: 'en-GB' });
    });
  });

  describe('date/time locale validation and reset', () => {
    it('rejects unsupported locales before writing', async () => {
      const spy = jest.spyOn(fixture.store, 'updateUser');
      await expect(fixture.service.updateDateTimePreferences(42, { dateTimeLocale: 'zz-ZZ' })).rejects.toThrow(
        BadRequestException,
      );
      expect(spy).not.toHaveBeenCalled();
    });
    it('persists an explicit null without changing translation language', async () => {
      const [user] = fixture.store.seed({ id: 42, locale: 'de', dateTimeLocale: 'en-GB' });

      expect(await fixture.service.updateDateTimePreferences(user.id, { dateTimeLocale: null })).toMatchObject({
        locale: 'de',
        dateTimeLocale: null,
      });
    });
  });

  describe('createOne – locale', () => {
    beforeEach(() => {
      fixture.store.seed({ username: 'first', email: 'first@example.com' });
    });

    it('sets locale when provided', async () => {
      const user = await fixture.service.createOne({
        username: 'usr',
        email: 'u@x.com',
        externalIdentifier: null,
        locale: 'de',
      });
      expect(user.locale).toBe('de');
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });

    it('stores a supported full BCP 47 locale tag without lowercasing or truncating', async () => {
      const user = await fixture.service.createOne({
        username: 'usr',
        email: 'u@x.com',
        externalIdentifier: null,
        locale: 'EN-Latn-GB',
      });
      expect(user.locale).toBe('EN-Latn-GB');
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
      },
    );

    it('leaves the personal locale undetermined when none was provided', async () => {
      const user = await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      expect(user.locale).toBe('und');
    });
  });

  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const [user] = fixture.store.seed({ locale: 'en' });

      const result = await fixture.service.updateLocale(user.id, 'de-DE');

      expect(fixture.mockMetricsService.usersLocaleSyncsTotal.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(fixture.mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(result).toMatchObject({ id: user.id, locale: 'de-DE' });
    });

    it('throws BadRequestException for empty locale', async () => {
      await expect(fixture.service.updateLocale(1, '   ')).rejects.toThrow(BadRequestException);
    });

    it('throws UserNotFoundException for an unknown user', async () => {
      await expect(fixture.service.updateLocale(1, 'de')).rejects.toThrow(UserNotFoundException);
    });
  });

  describe('requestSelfDeletion', () => {
    it('stores only the hash of the confirmation token and mails the raw token', async () => {
      const [user] = fixture.store.seed({ username: 'leaver' });

      await fixture.service.requestSelfDeletion(user.id);

      const [recipient, rawToken] = fixture.emailService.sendDeleteAccountConfirmationEmail.mock.calls[0];
      expect(recipient).toMatchObject({ id: user.id });
      expect(fixture.store.users[0].deleteAccountToken).toBe(`hashed:${rawToken}`);
      expect(fixture.store.users[0].deleteAccountTokenExpiresAt).toBeInstanceOf(Date);
    });
  });

  describe('confirmSelfDeletion', () => {
    const futureDate = new Date(Date.now() + 86_400_000);

    it('throws ForbiddenException when user is the last administrator', async () => {
      const [admin] = fixture.store.seed({
        email: 'admin@example.com',
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      });
      fixture.mockRbacService.isLastAdministrator.mockResolvedValue(true);

      await expect(fixture.service.confirmSelfDeletion(' Admin@Example.COM ', 'tok')).rejects.toThrow(
        ForbiddenException,
      );
      expect(fixture.store.users[0].deletedAt).toBeNull();
      expect(fixture.mockRbacService.isLastAdministrator).toHaveBeenCalledWith(admin.id, expect.anything());
    });

    it('treats a repeated confirmation as success after the email has been reused', async () => {
      fixture.store.seed(
        {
          id: 2,
          email: 'deleted@example.com',
          deleteAccountToken: 'hashed:different-token',
          deleteAccountTokenExpiresAt: futureDate,
        },
        {
          id: 1,
          email: 'deleted-user-1-x@deleted.local',
          deletedAt: new Date(),
          deleteAccountToken: 'hashed:tok',
          deleteAccountTokenExpiresAt: futureDate,
        },
      );

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).resolves.toBeUndefined();

      expect(fixture.store.users.find((user) => user.id === 2)?.deletedAt).toBeNull();
    });

    it('rejects an expired confirmation token for a deleted account', async () => {
      fixture.store.seed({
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: new Date(Date.now() - 1_000),
      });

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).rejects.toThrow(
        'DeleteAccountTokenExpiredException',
      );
    });

    it('rejects an unknown or mismatching token', async () => {
      fixture.store.seed({
        email: 'a@example.com',
        deleteAccountToken: 'hashed:other',
        deleteAccountTokenExpiresAt: futureDate,
      });

      await expect(fixture.service.confirmSelfDeletion('a@example.com', 'tok')).rejects.toThrow(
        'DeleteAccountTokenInvalidException',
      );
      await expect(fixture.service.confirmSelfDeletion('nobody@example.com', 'tok')).rejects.toThrow(
        'DeleteAccountTokenInvalidException',
      );
    });

    it('accepts a confirmation created before tokens were stored as hashes', async () => {
      fixture.store.seed({
        email: 'a@example.com',
        deleteAccountToken: 'tok',
        deleteAccountTokenExpiresAt: futureDate,
      });

      await fixture.service.confirmSelfDeletion('a@example.com', 'tok');

      expect(fixture.store.users[0].deletedAt).toBeInstanceOf(Date);
    });

    it('retains confirmation token evidence while confirming an account deletion', async () => {
      fixture.store.seed({
        id: 1,
        email: 'deleted@example.com',
        locale: 'en',
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
        deleteAccountRequestedAt: new Date(),
      });
      // base64url of these bytes is "ABCDEFGH", so the generated suffix is uppercase before normalisation
      jest.mocked(randomBytes).mockImplementationOnce(() => Buffer.from([0x00, 0x10, 0x83, 0x10, 0x51, 0x87]));

      await fixture.service.confirmSelfDeletion('deleted@example.com', 'tok');

      expect(fixture.store.users[0]).toMatchObject({
        username: 'deleted-user-1-ABCDEFGH',
        email: 'deleted-user-1-abcdefgh@deleted.local',
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
        deleteAccountRequestedAt: expect.any(Date),
      });
      expect(fixture.mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  describe('deleting accounts', () => {
    it('refuses to delete the last administrator and changes nothing', async () => {
      const [admin] = fixture.store.seed({});
      fixture.mockRbacService.isLastAdministrator.mockResolvedValue(true);

      await expect(fixture.service.deleteOne(admin.id)).rejects.toThrow('Cannot delete the last administrator');
      expect(fixture.store.users[0].deletedAt).toBeNull();
      expect(fixture.mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
    });

    it('refuses while the user has a running usage session', async () => {
      const [user] = fixture.store.seed({});
      fixture.store.activeUsageUserIds.add(user.id);

      await expect(fixture.service.deleteOne(user.id)).rejects.toThrow(UserHasActiveUsageSessionsException);
    });

    it('reports an unknown user and treats a deleted one as done', async () => {
      await expect(fixture.service.deleteOne(77)).rejects.toThrow(UserNotFoundException);
      fixture.store.seed({ id: 5, deletedAt: new Date() });
      await expect(fixture.service.deleteOne(5)).resolves.toBeUndefined();
    });

    it('deleteMany anonymizes every user in one unit of work, checking each for last administrator', async () => {
      const users = fixture.store.seed({}, {});

      await fixture.service.deleteMany(users.map((user) => user.id));

      expect(fixture.uow.events).toEqual(['begin', 'commit']);
      expect(fixture.store.users.every((user) => user.deletedAt)).toBe(true);
      expect(fixture.mockRbacService.isLastAdministrator).toHaveBeenCalledTimes(2);
    });

    it('deleteMany does nothing for an empty list', async () => {
      await fixture.service.deleteMany([]);
      expect(fixture.uow.events).toEqual([]);
    });
  });

  describe('single-use token consumption', () => {
    it('delegates to the store, which decides which caller wins', async () => {
      const [user] = fixture.store.seed({
        emailVerificationToken: 'a',
        passwordResetToken: 'b',
        isEmailVerified: false,
      });

      await expect(fixture.service.consumeEmailVerificationToken(user.id, 'a')).resolves.toBe(true);
      await expect(fixture.service.consumeEmailVerificationToken(user.id, 'a')).resolves.toBe(false);
      await expect(fixture.service.consumePasswordResetToken(user.id, 'b')).resolves.toBe(true);
      await expect(fixture.service.consumePasswordResetToken(user.id, 'b')).resolves.toBe(false);
      expect(fixture.store.users[0]).toMatchObject({ isEmailVerified: true, emailVerificationToken: null });
    });
  });

  describe('bulk user role assignment', () => {
    const setRole = (rolePermissions: string[] | null) =>
      fixture.rbacStore.findRoleByKey.mockResolvedValue(
        rolePermissions && { rolePermissions: rolePermissions.map((permissionKey) => ({ permissionKey })) },
      );

    it('bootstraps one administrator and assigns defaults to remaining normalized users', async () => {
      const context = fakeTransactionScope();
      const users = await fixture.service.createMany(
        [
          { username: ' FIRST ', email: ' First@Example.COM ', locale: ' de ' },
          { username: 'second', email: 'second@example.com', locale: ' ' },
        ],
        { context, grantAllPermissionsToFirst: true },
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
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(users[0].id, 'administrator', context);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledTimes(1);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(users[1].id, context);
    });
    it.each(['fr-FR', 'en-!!!', 'de-u-12'])('keeps unsupported imported preference %s undetermined', async (locale) => {
      fixture.store.seed({}, {}, {});
      const [user] = await fixture.service.createMany([{ username: 'member', email: 'member@example.com', locale }]);
      expect(user.locale).toBe('und');
    });
    it('opens its own unit of work when the caller has none and counts the locale metric after commit', async () => {
      fixture.store.seed({});
      await fixture.service.createMany([{ username: 'member', email: 'member@example.com', locale: 'de' }]);
      expect(fixture.uow.events).toEqual(['begin', 'commit']);
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de' });
    });
    it('assigns allowed explicit roles alongside defaults without another administrator', async () => {
      fixture.store.seed({}, {}, {});
      const context = fakeTransactionScope();
      setRole(['resources.view']);
      const actor = { id: 9, effectivePermissions: new Set(['resources.view']) } as AuthenticatedUser;
      const [member] = await fixture.service.createMany(
        [{ username: 'member', email: 'member@example.com', roleKey: 'viewer' }],
        { context, grantAllPermissionsToFirst: true, actor },
      );
      expect(fixture.mockRbacService.getGrantCeiling).toHaveBeenCalledWith(actor);
      expect(fixture.mockRbacService.assignDefaultRoles).toHaveBeenCalledWith(member.id, context);
      expect(fixture.mockRbacService.assignRoleByKey).toHaveBeenCalledWith(member.id, 'viewer', context);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalledWith(member.id, 'administrator', context);
    });
    it('refuses an import role above the actor privilege ceiling', async () => {
      fixture.store.seed({});
      setRole(['users.update']);
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'admin' }], {
          actor: { id: 9, effectivePermissions: new Set(['resources.view']) } as AuthenticatedUser,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(fixture.mockRbacService.assignRoleByKey).not.toHaveBeenCalled();
    });
    it('rejects an unknown role and an empty email', async () => {
      setRole(null);
      const context = fakeTransactionScope();
      await expect(
        fixture.service.createMany([{ username: 'member', email: 'member@example.com', roleKey: 'missing' }], {
          context,
        }),
      ).rejects.toThrow("Role with key 'missing' not found");
      await expect(fixture.service.createMany([{ username: 'member', email: ' ' }], { context })).rejects.toThrow(
        'Email is required',
      );
    });
  });

  describe('first-time setup replacement', () => {
    it('renames the sole unverified account and puts it back on rollback', async () => {
      const [setup] = fixture.store.seed({
        id: 1,
        username: 'setup',
        email: 'setup@example.com',
        isEmailVerified: false,
      });

      const released = await fixture.service.releaseFirstTimeSetupAdminIdentifiers();
      expect(released).toMatchObject({ id: 1, username: 'setup' });
      expect(fixture.store.users[0].username).toMatch(/^first-time-setup-1-/);

      const [replacement] = fixture.store.seed({ id: 2, username: 'new' });
      await fixture.service.rollbackFirstTimeSetupAdminReplacement(replacement.id, setup);

      expect(fixture.store.users).toHaveLength(1);
      expect(fixture.store.users[0]).toMatchObject({ username: 'setup', email: 'setup@example.com' });
    });

    it.each([
      ['no account exists', []],
      ['the account is verified', [{ id: 1, isEmailVerified: true }]],
      [
        'another active account exists',
        [
          { id: 1, isEmailVerified: false },
          { id: 2, isEmailVerified: false },
        ],
      ],
    ])('refuses when %s', async (_name, seeds) => {
      fixture.store.seed(...(seeds as Array<Partial<ReturnType<typeof aUserRecord>>>));
      await expect(fixture.service.releaseFirstTimeSetupAdminIdentifiers()).rejects.toThrow(
        'First-time setup is already complete',
      );
    });
  });
});
