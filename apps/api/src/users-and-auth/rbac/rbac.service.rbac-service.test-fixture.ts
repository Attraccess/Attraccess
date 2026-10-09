import { Permission, Role, RolePermission, User, UserRole, UserRoleSource } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacService } from './rbac.service';

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
export function registerRbacServiceFixture() {
  let service: RbacService;

  let userRoleRepo: jest.Mocked<Repository<UserRole>>;

  let roleRepo: jest.Mocked<Repository<Role>>;

  let permissionRepo: jest.Mocked<Repository<Permission>>;

  let userRepo: jest.Mocked<Repository<User>>;

  let rolePermissionRepo: jest.Mocked<Repository<RolePermission>>;

  let eventEmitter: { emit: jest.Mock };

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
      getRepository: jest.fn((entity) => (entity === UserRole ? userRoleRepo : roleRepo)),
    };
    const mockTransaction = jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(mockManager));

    userRoleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as UserRole),
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
      create: jest.fn((data) => ({ ...data }) as Role),
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
    } as unknown as jest.Mocked<Repository<User>>;

    rolePermissionRepo = {
      save: jest.fn(),
      create: jest.fn((data) => ({ ...data }) as RolePermission),
    } as unknown as jest.Mocked<Repository<RolePermission>>;
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(UserRole), useValue: userRoleRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Permission), useValue: permissionRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RolePermission), useValue: rolePermissionRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  // ───────────────────────── role CRUD (ATT-728) ─────────────────────────────

  const makePermission = (key: string): Permission =>
    ({
      key,
      label: key,
      description: key,
      category: key.split('.')[0],
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as Permission;
  return {
    get createMockQueryBuilder() {
      return createMockQueryBuilder;
    },
    get makeRole() {
      return makeRole;
    },
    get makeUserRole() {
      return makeUserRole;
    },
    get service() {
      return service;
    },
    get userRoleRepo() {
      return userRoleRepo;
    },
    get roleRepo() {
      return roleRepo;
    },
    get permissionRepo() {
      return permissionRepo;
    },
    get userRepo() {
      return userRepo;
    },
    get rolePermissionRepo() {
      return rolePermissionRepo;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get roleManager() {
      return roleManager;
    },
    get makePermission() {
      return makePermission;
    },
  };
}
