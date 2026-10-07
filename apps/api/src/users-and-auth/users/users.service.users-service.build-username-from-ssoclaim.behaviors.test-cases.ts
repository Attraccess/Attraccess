import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { Role, User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

export function registerBuildUsernameFromSsoclaimCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
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
}

export function registerBulkUserRoleAssignmentCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
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
}

export function registerCreateOneLocaleCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
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

    it('leaves locale at column default when not provided', async () => {
      await fixture.service.createOne({ username: 'usr', email: 'u@x.com', externalIdentifier: null });
      const saved = (fixture.userRepository.save as jest.Mock).mock.calls[0][0] as Partial<User>;
      expect(saved.locale).toBeUndefined();
    });
  });
}

export function registerCreateOneCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
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
}
