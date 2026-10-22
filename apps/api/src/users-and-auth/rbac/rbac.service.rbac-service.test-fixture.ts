import { OperationToken, TransactionScope } from '../../database/transaction-scope';
import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { RbacPersistence, RBAC_WRITES } from './persistence/port';
import { Permission, Role, UserRole, UserRoleSource } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RbacService } from './rbac.service';
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
  let persistence: jest.Mocked<RbacPersistence>;
  let driver: ReturnType<typeof operationTransactionsFake>;
  let eventEmitter: EventEmitter2;
  beforeEach(() => {
    const role = jest.fn();
    const roles = jest.fn().mockResolvedValue([]);
    persistence = {
      roleByKey: role,
      roleById: role,
      grant: jest.fn(),
      ssoGrants: jest.fn(),
      roleAssignments: jest.fn().mockResolvedValue([]),
      administratorGrantCount: jest.fn().mockResolvedValue(0),
      createGrant: jest.fn(async (input) => ({ id: 1, ...input }) as UserRole),
      removeGrant: jest.fn(),
      removeManualGrant: jest.fn().mockResolvedValue(true),
      updateExternalValue: jest.fn(),
      defaultRoles: roles,
      saveRoleFields: jest.fn(),
      removePermissions: jest.fn(),
      addPermission: jest.fn(),
      removeRole: jest.fn(),
      fullPermissionHolderCount: jest.fn().mockResolvedValue(0),
      effectivePermissionKeys: jest.fn().mockResolvedValue([]),
      userRoles: jest.fn(),
      userIdsWithPermission: jest.fn(),
      userExists: jest.fn().mockResolvedValue(true),
      roles,
      roleKey: jest.fn(),
      roleUserCounts: jest.fn(),
      permissionsByKeys: jest.fn(),
      permissionCount: jest.fn().mockResolvedValue(0),
      permissions: jest.fn(),
      roleKeyExists: jest.fn().mockResolvedValue(false),
      createRole: jest.fn(async (input) => ({ id: 42, ...input }) as Role),
      addPermissions: jest.fn(),
    };
    driver = operationTransactionsFake();
    driver.bind(RBAC_WRITES, persistence);
    eventEmitter = new EventEmitter2();
    jest.spyOn(eventEmitter, 'emit');
    service = new RbacService(persistence, driver.transactions, eventEmitter, null);
  });
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
    parentScope(): TransactionScope {
      return {
        backend: 'fake',
        conflicts: { resourceIds: [], accountIds: [] },
        afterCommit: jest.fn(),
        resolve: <T extends object>(_token: OperationToken<T>) => persistence as unknown as T,
      };
    },
    get persistence() {
      return persistence;
    },
    get driver() {
      return driver;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get service() {
      return service;
    },
    get makeRole() {
      return makeRole;
    },
    get makeUserRole() {
      return makeUserRole;
    },
    get makePermission() {
      return makePermission;
    },
  };
}
