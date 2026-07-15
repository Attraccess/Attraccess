/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { Permission, Role, User, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { RbacService } from './rbac.service';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

// ─── helpers ────────────────────────────────────────────────────────────────

const createMockQueryBuilder = (overrides: Record<string, unknown> = {}) => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  distinct: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
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
      delete: jest.fn(),
      create: jest.fn((data) => ({ ...data } as UserRole)),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      manager: { transaction: mockTransaction },
    } as unknown as jest.Mocked<Repository<UserRole>>;

    roleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>>;

    permissionRepo = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Permission>>;

    userRepo = {
      existsBy: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Repository<User>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Permission), useValue: permissionRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
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

  // ───────────────────────────── assignRole ──────────────────────────────────

  describe('assignRole', () => {
    it('throws UserNotFoundException when user does not exist', async () => {
      userRepo.existsBy.mockResolvedValue(false);

      await expect(service.assignRole(99, 1, new Set())).rejects.toThrow(UserNotFoundException);
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

    it('throws ForbiddenException when removing last owner', async () => {
      const ownerRole = makeRole({
        key: 'owner',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      roleRepo.findOne.mockResolvedValue(ownerRole);

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

    it('allows revoking owner role when multiple owners exist', async () => {
      const ownerRole = makeRole({
        key: 'owner',
        rolePermissions: [{ permissionKey: 'system.admin' } as any],
      });
      roleRepo.findOne.mockResolvedValue(ownerRole);

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

    it('skips owner role removal when it is the last owner', async () => {
      const ownerRole = makeRole({ key: 'owner' });
      const currentSsoRoles = [
        makeUserRole({ id: 7, source: UserRoleSource.SSO, role: ownerRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // otherOwnerCount = 0 — this is the last owner, skip removal
      const mockQb = createMockQueryBuilder({ getCount: jest.fn().mockResolvedValue(0) });
      userRoleRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      // target set does not include 'owner'
      await service.syncSsoRoles(10, [], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('removes owner role when other owners exist', async () => {
      const ownerRole = makeRole({ key: 'owner' });
      const currentSsoRoles = [
        makeUserRole({ id: 7, source: UserRoleSource.SSO, role: ownerRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      // Another owner exists
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

      await service.syncSsoRoles(10, ['manager'], SSO_TYPE, SSO_ID);

      expect(userRoleRepo.save).toHaveBeenCalled();
    });

    it('skips adding a role when already present in currentSsoRoles', async () => {
      const existingRole = makeRole({ key: 'manager' });
      const currentSsoRoles = [
        makeUserRole({ source: UserRoleSource.SSO, role: existingRole }),
      ];
      userRoleRepo.find.mockResolvedValue(currentSsoRoles);

      await service.syncSsoRoles(10, ['manager'], SSO_TYPE, SSO_ID);

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
      await expect(service.syncSsoRoles(10, ['editor'], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
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

      await expect(service.syncSsoRoles(10, ['editor'], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
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

      await expect(service.syncSsoRoles(10, ['editor'], SSO_TYPE, SSO_ID)).rejects.toThrow(QueryFailedError);
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

      await expect(service.syncSsoRoles(10, ['editor'], SSO_TYPE, SSO_ID)).rejects.toThrow(QueryFailedError);
    });

    it('silently skips roles that do not exist in the database', async () => {
      userRoleRepo.find.mockResolvedValue([]);
      roleRepo.findOne.mockResolvedValue(null); // unknown role key

      await expect(service.syncSsoRoles(10, ['unknown-role'], SSO_TYPE, SSO_ID)).resolves.toBeUndefined();
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
});
