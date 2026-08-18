/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { Permission, Role, RolePermission, User, UserRole, UserRoleSource, UserType } from '@attraccess/database-entities';
import { RbacService } from './rbac.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

// ─── helpers ────────────────────────────────────────────────────────────────

const createMockQueryBuilder = (overrides: Record<string, unknown> = {}) => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  distinct: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  having: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
  getRawMany: jest.fn().mockResolvedValue([]),
  ...overrides,
});

const makeRole = (partial: Partial<Role> = {}): Role =>
  ({
    id: 1,
    key: 'member',
    name: 'Member',
    description: 'A regular member',
    isSystemManaged: false,
    isDefault: false,
    rolePermissions: [],
    userRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }) as Role;

const makeUserRole = (partial: Partial<UserRole> = {}): UserRole =>
  ({
    id: 1,
    userId: 10,
    roleId: 1,
    source: UserRoleSource.MANUAL,
    ssoProviderType: null,
    ssoProviderId: null,
    externalValue: null,
    role: makeRole(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  }) as UserRole;

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RbacService', () => {
  let service: RbacService;
  let userRoleRepo: jest.Mocked<Repository<UserRole>>;
  let roleRepo: jest.Mocked<Repository<Role>>;
  let permissionRepo: jest.Mocked<Repository<Permission>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let rolePermissionRepo: jest.Mocked<Repository<RolePermission>>;
  let roleManager: {
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    const mockQb = createMockQueryBuilder();

    // manager.transaction calls the callback with a mock EntityManager that proxies back
    // to userRoleRepo so count/delete mocks still apply in the transactional path.
    const mockManager = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      delete: jest.fn(),
    };
    const mockTransaction = jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

    userRoleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((data) => ({ ...data } as UserRole)),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      manager: { transaction: mockTransaction },
    } as unknown as jest.Mocked<Repository<UserRole>>;

    roleManager = {
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, data) => ({ ...data })),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    };

    roleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((data) => Promise.resolve({ id: 42, ...data } as Role)),
      create: jest.fn((data) => ({ ...data } as Role)),
      existsBy: jest.fn().mockResolvedValue(false),
      manager: {
        transaction: jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(roleManager)),
      },
    } as unknown as jest.Mocked<Repository<Role>>;

    permissionRepo = {
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<Repository<Permission>>;

    userRepo = {
      existsBy: jest.fn().mockResolvedValue(true),
      findOne: jest.fn().mockResolvedValue({ id: 10, userType: UserType.MEMBER } as User),
    } as unknown as jest.Mocked<Repository<User>>;

    rolePermissionRepo = {
      save: jest.fn(),
      create: jest.fn((data) => ({ ...data } as RolePermission)),
    } as unknown as jest.Mocked<Repository<RolePermission>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Permission), useValue: permissionRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RolePermission), useValue: rolePermissionRepo },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ───────────────────────── getEffectivePermissions ─────────────────────────

  describe('getEffectivePermissions', () => {
    it('returns empty set when user has no roles', async () => {
      const mockQb = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });

    it('returns union of all permissions from all assigned roles', async () => {
      const rows = [{ permissionKey: 'resources.read' }, { permissionKey: 'resources.write' }];
      const mockQb = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await service.getEffectivePermissions(10);

      expect(perms.has('resources.read')).toBe(true);
      expect(perms.has('resources.write')).toBe(true);
      expect(perms.size).toBe(2);
    });

    it('handles roles with no rolePermissions gracefully', async () => {
      const mockQb = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const perms = await service.getEffectivePermissions(10);

      expect(perms.size).toBe(0);
    });
  });

  // ─────────────────────── getUserIdsWithPermission ──────────────────────────

  describe('getUserIdsWithPermission', () => {
    // Soft-deleting a user leaves their user_role rows behind, so without this join a deleted
    // admin stays a permission holder forever — e.g. counted as an available supervisor (ATT-867).
    it('excludes soft-deleted users', async () => {
      const mockQb = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 10 }]) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const ids = await service.getUserIdsWithPermission('resources.update');

      expect(ids).toEqual([10]);
      expect(mockQb.innerJoin).toHaveBeenCalledWith('ur.user', 'u', 'u.deletedAt IS NULL');
    });
  });

  // ───────────────────────────── assignRole ──────────────────────────────────

  describe('assignRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws BadRequestException when the target user is a guest', async () => {
      userRepo.findOne.mockResolvedValue({ id: 10, userType: UserType.GUEST } as User);

      await expect(service.assignRole(10, 1, new Set())).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);

      const actorPermissions = new Set(['resources.read']); // missing resources.write

      await expect(service.assignRole(10, 1, actorPermissions)).rejects.toThrow(ForbiddenException);
    });

    it('returns existing UserRole if already assigned', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);
      const existing = makeUserRole();
      userRoleRepo.findOne.mockResolvedValue(existing);

      const actorPermissions = new Set(['resources.read']);
      const result = await service.assignRole(10, 1, actorPermissions);

      expect(result).toBe(existing);
      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('creates and returns a new UserRole when actor has all permissions', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);
      userRoleRepo.findOne.mockResolvedValue(null);
      const saved = makeUserRole();
      userRoleRepo.save.mockResolvedValue(saved);

      const actorPermissions = new Set(['resources.read', 'resources.write']);
      const result = await service.assignRole(10, 1, actorPermissions);

      expect(userRoleRepo.save).toHaveBeenCalled();
      expect(result).toBe(saved);
    });

    it('succeeds when role grants no permissions (empty permission set)', async () => {
      const role = makeRole({ rolePermissions: [] });
      roleRepo.findOne.mockResolvedValue(role);
      userRoleRepo.findOne.mockResolvedValue(null);
      const saved = makeUserRole();
      userRoleRepo.save.mockResolvedValue(saved);

      const result = await service.assignRole(10, 1, new Set());

      expect(result).toBe(saved);
    });
  });

  // ───────────────────────────── revokeRole ──────────────────────────────────

  describe('revokeRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      userRepo.existsBy.mockResolvedValue(false);

      await expect(service.revokeRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
    });

    it('throws NotFoundException when role does not exist', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.revokeRole(10, 99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when actor lacks a permission the role grants', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.write' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);

      await expect(service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when removing last administrator', async () => {
      const administratorRole = makeRole({
        key: 'administrator',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      roleRepo.findOne.mockResolvedValue(administratorRole);

      // The TOCTOU-safe path uses manager.transaction; mock the manager's QB to return count=1
      const mockQb = createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(1) });
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        delete: jest.fn(),
      };
      (userRoleRepo.manager as any).transaction = jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

      await expect(service.revokeRole(10, 1, new Set(['system.admin']))).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when role is not manually assigned to the user', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);
      userRoleRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await expect(service.revokeRole(10, 1, new Set(['resources.read']))).rejects.toThrow(ConflictException);
    });

    it('succeeds when actor has all permissions and assignment is manual', async () => {
      const role = makeRole({
        rolePermissions: [{ permissionKey: 'resources.read' } as any],
      });
      roleRepo.findOne.mockResolvedValue(role);
      userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await expect(service.revokeRole(10, 1, new Set(['resources.read']))).resolves.toBeUndefined();
      expect(userRoleRepo.delete).toHaveBeenCalled();
    });

    it('allows revoking administrator role when multiple administrators exist', async () => {
      const administratorRole = makeRole({
        key: 'administrator',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      roleRepo.findOne.mockResolvedValue(administratorRole);

      // The TOCTOU-safe path uses manager.transaction; mock the manager's QB to return count=2
      const mockQb = createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(2) });
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      };
      (userRoleRepo.manager as any).transaction = jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

      await expect(service.revokeRole(10, 1, new Set(['system.admin']))).resolves.toBeUndefined();
      expect(mockManager.delete).toHaveBeenCalled();
    });
  });

  // ───────────────────────────── syncSsoRoles ────────────────────────────────

  describe('syncSsoRoles', () => {
    const SSO_TYPE = 'oidc';
    const SSO_ID = 42;

    it('removes SSO roles no longer in the target set', async () => {
      const droppedRole = makeRole({ key: 'member' });
      const currentSsoRoles = [
        makeUserRole({ id: 5, source: UserRoleSource.SSO, role: droppedRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);
      userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      // target set is empty — member should be removed
      await service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.delete).toHaveBeenCalledWith({ id: 5 });
    });

    it('skips administrator role removal when it is the last administrator', async () => {
      const administratorRole = makeRole({ key: 'administrator' });
      const currentSsoRoles = [
        makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // otherAdministratorCount = 0 — this is the last administrator, skip removal
      const mockQb = createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(0) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      // target set does not include 'administrator'
      await service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('removes administrator role when other administrators exist', async () => {
      const administratorRole = makeRole({ key: 'administrator' });
      const currentSsoRoles = [
        makeUserRole({ id: 7, source: UserRoleSource.SSO, role: administratorRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // Another administrator exists
      const mockQb = createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(1) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);
      userRoleRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.delete).toHaveBeenCalledWith({ id: 7 });
    });

    it('adds new roles that are in the target set but not yet assigned', async () => {
      userRoleRepo.find.mockResolvedValue([]); // no existing SSO roles
      const newRole = makeRole({ id: 3, key: 'manager' });
      roleRepo.findOne.mockResolvedValue(newRole);
      userRoleRepo.findOne.mockResolvedValue(null); // not already present
      const saved = makeUserRole({ roleId: 3, source: UserRoleSource.SSO });
      userRoleRepo.save.mockResolvedValue(saved);

      await service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: 3, source: UserRoleSource.SSO, externalValue: 'idp_manager' }),
      );
      expect(userRoleRepo.save).toHaveBeenCalled();
    });

    it('refreshes externalValue on an existing SSO assignment when it changes', async () => {
      const existingRole = makeRole({ key: 'manager' });
      const currentSsoRoles = [
        makeUserRole({ id: 9, source: UserRoleSource.SSO, role: existingRole, externalValue: 'old_group' }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      await service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'new_group' }], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.update).toHaveBeenCalledWith({ id: 9 }, { externalValue: 'new_group' });
      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('skips adding a role when already present in currentSsoRoles', async () => {
      const existingRole = makeRole({ key: 'manager' });
      const currentSsoRoles = [
        makeUserRole({ source: UserRoleSource.SSO, role: existingRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      await service.syncSsoRoles(10, [{ roleKey: 'manager', externalValue: 'idp_manager' }], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('handles unique constraint violation (23505) gracefully when adding', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      const newRole = makeRole({ id: 4, key: 'editor' });
      roleRepo.findOne.mockResolvedValue(newRole);
      userRoleRepo.findOne.mockResolvedValue(null);

      const uniqueViolation = Object.assign(new QueryFailedError('', [], new Error('unique violation')), {
        code: '23505',
      });
      userRoleRepo.save.mockRejectedValue(uniqueViolation);

      // Should NOT throw
      await expect(service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
    });

    it('handles unique constraint violation (SQLITE_CONSTRAINT) gracefully when adding', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      const newRole = makeRole({ id: 4, key: 'editor' });
      roleRepo.findOne.mockResolvedValue(newRole);
      userRoleRepo.findOne.mockResolvedValue(null);

      const sqliteViolation = Object.assign(new QueryFailedError('', [], new Error('UNIQUE constraint failed')), {
        code: 'SQLITE_CONSTRAINT',
      });
      userRoleRepo.save.mockRejectedValue(sqliteViolation);

      await expect(service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
    });

    it('rethrows non-unique SQLITE_CONSTRAINT errors (e.g. FK violation)', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      const newRole = makeRole({ id: 4, key: 'editor' });
      roleRepo.findOne.mockResolvedValue(newRole);
      userRoleRepo.findOne.mockResolvedValue(null);

      const fkError = Object.assign(new QueryFailedError('', [], new Error('FOREIGN KEY constraint failed')), {
        code: 'SQLITE_CONSTRAINT',
      });
      userRoleRepo.save.mockRejectedValue(fkError);

      await expect(service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(QueryFailedError);
    });

    it('rethrows non-unique-constraint errors', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      const newRole = makeRole({ id: 4, key: 'editor' });
      roleRepo.findOne.mockResolvedValue(newRole);
      userRoleRepo.findOne.mockResolvedValue(null);

      const otherError = Object.assign(new QueryFailedError('', [], new Error('other db error')), {
        code: '42P01',
      });
      userRoleRepo.save.mockRejectedValue(otherError);

      await expect(service.syncSsoRoles(10, [{ roleKey: 'editor' }], SSO_TYPE, SSO_ID)).rejects.toThrow(QueryFailedError);
    });

    it('silently skips roles that do not exist in the database', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      roleRepo.findOne.mockResolvedValue(null); // unknown role key

      await expect(service.syncSsoRoles(10, [{ roleKey: 'unknown-role' }], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────── assignDefaultRoles ─────────────────────────────

  describe('assignDefaultRoles', () => {
    it('assigns all isDefault roles that are not yet assigned', async () => {
      const defaultRoles = [
        makeRole({ id: 1, key: 'basic', isDefault: true }),
        makeRole({ id: 2, key: 'reader', isDefault: true }),
      ];
      roleRepo.find.mockResolvedValue(defaultRoles);
      userRoleRepo.findOne.mockResolvedValue(null); // neither already assigned
      const saved = makeUserRole();
      userRoleRepo.save.mockResolvedValue(saved);

      await service.assignDefaultRoles(10);

      expect(userRoleRepo.save).toHaveBeenCalledTimes(2);
    });

    it('skips roles that are already assigned', async () => {
      const defaultRoles = [makeRole({ id: 1, key: 'basic', isDefault: true })];
      roleRepo.find.mockResolvedValue(defaultRoles);
      userRoleRepo.findOne.mockResolvedValue(makeUserRole()); // already exists

      await service.assignDefaultRoles(10);

      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });

    it('does nothing when there are no default roles', async () => {
      roleRepo.find.mockResolvedValue([]);

      await service.assignDefaultRoles(10);

      expect(userRoleRepo.save).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────── role CRUD (ATT-728) ─────────────────────────────

  const makePermission = (key: string): Permission =>
    ({ key, label: key, description: key, category: key.split('.')[0], createdAt: new Date(), updatedAt: new Date() }) as Permission;

  describe('getRolesWithUsage', () => {
    it('merges user counts into roles', async () => {
      roleRepo.find.mockResolvedValue([makeRole({ id: 1 }), makeRole({ id: 2, key: 'other' })]);
      const mockQb = createMockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([{ roleId: 1, userCount: '3' }]),
      });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.getRolesWithUsage();

      expect(result.find((r) => r.id === 1)?.userCount).toBe(3);
      expect(result.find((r) => r.id === 2)?.userCount).toBe(0);
    });
  });

  describe('createRole', () => {
    it('creates a custom role with a slugified key and permissions', async () => {
      permissionRepo.find.mockResolvedValue([makePermission('resources.read')]);
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 42, key: 'workshop-supervisor' }));

      await service.createRole(
        { name: 'Workshop Supervisor!', description: 'desc', permissionKeys: ['resources.read'] },
        new Set(['resources.read']),
      );

      expect(roleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'workshop-supervisor', name: 'Workshop Supervisor!', isSystemManaged: false }),
      );
      expect(rolePermissionRepo.save).toHaveBeenCalledWith([
        expect.objectContaining({ roleId: 42, permissionKey: 'resources.read' }),
      ]);
    });

    it('appends a numeric suffix when the key is already taken', async () => {
      permissionRepo.find.mockResolvedValue([]);
      (roleRepo.existsBy as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 42 }));

      await service.createRole({ name: 'User' }, new Set());

      expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'user-2' }));
    });

    it('rejects unknown permission keys', async () => {
      permissionRepo.find.mockResolvedValue([]);

      await expect(
        service.createRole({ name: 'X', permissionKeys: ['not.a.permission'] }, new Set(['not.a.permission'])),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects granting permissions the actor does not have', async () => {
      permissionRepo.find.mockResolvedValue([makePermission('billing.manage')]);

      await expect(
        service.createRole({ name: 'X', permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('throws NotFoundException for a missing role', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.updateRole(99, { name: 'X' }, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects modification of system-managed roles', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ isSystemManaged: true }));

      await expect(service.updateRole(1, { name: 'X' }, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('updates name and description without touching permissions', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 5 }));

      await service.updateRole(5, { name: ' New Name ', description: 'new desc' }, new Set());

      expect(roleRepo.save).toHaveBeenCalledWith({ id: 5, name: 'New Name', description: 'new desc' });
      expect(roleRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects adding permissions the actor does not have', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 5, rolePermissions: [] }));
      permissionRepo.find.mockResolvedValue([makePermission('billing.manage')]);

      await expect(
        service.updateRole(5, { permissionKeys: ['billing.manage'] }, new Set(['resources.read'])),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects removing permissions the actor does not have', async () => {
      roleRepo.findOne.mockResolvedValue(
        makeRole({ id: 5, rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission] }),
      );
      permissionRepo.find.mockResolvedValue([]);

      await expect(service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a permission removal that would leave no administrator-equivalent user', async () => {
      roleRepo.findOne.mockResolvedValue(
        makeRole({ id: 5, rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission] }),
      );
      permissionRepo.count.mockResolvedValue(16);
      const qbBefore = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      const qbAfter = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) });
      roleManager.createQueryBuilder.mockReturnValueOnce(qbBefore as any).mockReturnValueOnce(qbAfter as any);

      await expect(service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows a permission removal when administrator-equivalence is preserved', async () => {
      roleRepo.findOne.mockResolvedValue(
        makeRole({ id: 5, rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission] }),
      );
      permissionRepo.count.mockResolvedValue(16);
      const qbBefore = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      const qbAfter = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([{ userId: 1 }]) });
      roleManager.createQueryBuilder.mockReturnValueOnce(qbBefore as any).mockReturnValueOnce(qbAfter as any);

      await service.updateRole(5, { permissionKeys: [] }, new Set(['resources.read']));

      expect(roleManager.delete).toHaveBeenCalledWith(RolePermission, expect.objectContaining({ roleId: 5 }));
    });

    it('applies permission set changes in a transaction', async () => {
      roleRepo.findOne.mockResolvedValue(
        makeRole({ id: 5, rolePermissions: [{ roleId: 5, permissionKey: 'resources.read' } as RolePermission] }),
      );
      permissionRepo.find.mockResolvedValue([makePermission('users.read')]);

      await service.updateRole(5, { permissionKeys: ['users.read'] }, new Set(['users.read', 'resources.read']));

      expect(roleManager.delete).toHaveBeenCalledWith(RolePermission, expect.objectContaining({ roleId: 5 }));
      expect(roleManager.save).toHaveBeenCalledWith(
        RolePermission,
        expect.objectContaining({ roleId: 5, permissionKey: 'users.read' }),
      );
    });
  });

  describe('deleteRole', () => {
    const setAdministratorEquivalentCounts = (withoutRole: number, total: number) => {
      // countAdministratorEquivalentUsers is called twice: first excluding the role, then overall
      permissionRepo.count.mockResolvedValue(16);
      const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: i + 1 }));
      const qb1 = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows(withoutRole)) });
      const qb2 = createMockQueryBuilder({ getRawMany: jest.fn().mockResolvedValue(rows(total)) });
      userRoleRepo.createQueryBuilder.mockReturnValueOnce(qb1 as any).mockReturnValueOnce(qb2 as any);
    };

    it('throws NotFoundException for a missing role', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteRole(99, new Set())).rejects.toThrow(NotFoundException);
    });

    it('rejects deletion of system-managed roles', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ isSystemManaged: true }));

      await expect(service.deleteRole(1, new Set())).rejects.toThrow(ForbiddenException);
    });

    it('rejects deleting a role whose permissions exceed the actor', async () => {
      roleRepo.findOne.mockResolvedValue(
        makeRole({ id: 5, rolePermissions: [{ roleId: 5, permissionKey: 'billing.manage' } as RolePermission] }),
      );

      await expect(service.deleteRole(5, new Set(['resources.read']))).rejects.toThrow(ForbiddenException);
      expect(roleManager.delete).not.toHaveBeenCalled();
    });

    it('rejects reassigning to the role being deleted', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 5 }));

      await expect(service.deleteRole(5, new Set(), 5)).rejects.toThrow(BadRequestException);
    });

    it('rejects reassignment to a role whose permissions exceed the actor', async () => {
      roleRepo.findOne
        .mockResolvedValueOnce(makeRole({ id: 5 }))
        .mockResolvedValueOnce(
          makeRole({ id: 6, rolePermissions: [{ roleId: 6, permissionKey: 'billing.manage' } as RolePermission] }),
        );

      await expect(service.deleteRole(5, new Set(['resources.read']), 6)).rejects.toThrow(ForbiddenException);
    });

    it('blocks deletion that would leave no administrator-equivalent user', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(0, 1);

      await expect(service.deleteRole(5, new Set())).rejects.toThrow(ForbiddenException);
      expect(roleManager.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom role when administrator-equivalence is preserved', async () => {
      roleRepo.findOne.mockResolvedValue(makeRole({ id: 5 }));
      setAdministratorEquivalentCounts(1, 1);

      await service.deleteRole(5, new Set());

      expect(roleManager.delete).toHaveBeenCalledWith(Role, { id: 5 });
    });

    it('reassigns affected users to the target role before deleting', async () => {
      roleRepo.findOne
        .mockResolvedValueOnce(makeRole({ id: 5 }))
        .mockResolvedValueOnce(makeRole({ id: 6, rolePermissions: [] }));
      setAdministratorEquivalentCounts(1, 1);
      roleManager.find.mockResolvedValue([makeUserRole({ userId: 10, roleId: 5 }), makeUserRole({ id: 2, userId: 11, roleId: 5 })]);
      roleManager.findOne.mockResolvedValue(null);

      await service.deleteRole(5, new Set(), 6);

      expect(roleManager.save).toHaveBeenCalledTimes(2);
      expect(roleManager.save).toHaveBeenCalledWith(
        UserRole,
        expect.objectContaining({ userId: 10, roleId: 6, source: UserRoleSource.MANUAL }),
      );
      expect(roleManager.delete).toHaveBeenCalledWith(Role, { id: 5 });
    });
  });
});
