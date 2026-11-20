import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import {
  UserRoleSource,
  type PermissionRecord,
  type RoleRecord,
  type UserRoleRecord,
} from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../database/unit-of-work';
import { RbacService } from './rbac.service';
import { RBAC_STORE, type RbacStore } from './rbac.port';

const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };

export type MockedRbacStore = { [K in keyof RbacStore]: jest.Mock };

export const makeRole = (partial: Partial<RoleRecord> = {}): RoleRecord => ({
  id: 1,
  key: 'member',
  name: 'Member',
  description: 'A regular member',
  isSystemManaged: false,
  isDefault: false,
  rolePermissions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...partial,
});

/** A role that grants the given permission keys. */
export const makeRoleWith = (keys: string[], partial: Partial<RoleRecord> = {}): RoleRecord =>
  makeRole({
    rolePermissions: keys.map((permissionKey, index) => ({
      id: index + 1,
      roleId: partial.id ?? 1,
      permissionKey,
      createdAt: new Date(),
    })),
    ...partial,
  });

export const makeUserRole = (partial: Partial<UserRoleRecord> = {}): UserRoleRecord => ({
  id: 1,
  userId: 10,
  roleId: 1,
  source: UserRoleSource.MANUAL,
  ssoProviderType: null,
  ssoProviderId: null,
  externalValue: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...partial,
});

export const makePermission = (key: string): PermissionRecord => ({
  key,
  label: key,
  description: key,
  category: key.split('.')[0],
  pluginName: null,
  labelDe: null,
  descriptionDe: null,
  categoryLabel: null,
  categoryLabelDe: null,
  available: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** A unit of work whose scopes are plain objects; `scopes` lists every scope that was opened. */
export function createFakeUnitOfWork(): UnitOfWork & { scopes: TransactionScope[] } {
  const scopes: TransactionScope[] = [];
  return {
    scopes,
    current: () => undefined,
    run: async (work) => {
      const scope: TransactionScope = { isOpen: true, afterCommit: jest.fn() };
      scopes.push(scope);
      return work(scope);
    },
  };
}

export function registerRbacServiceFixture() {
  let service: RbacService;
  let store: MockedRbacStore;
  let uow: ReturnType<typeof createFakeUnitOfWork>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    store = {
      permissionKeysOf: jest.fn().mockResolvedValue([]),
      dormantPermissionKeysOf: jest.fn().mockResolvedValue([]),
      userIdsWithPermission: jest.fn().mockResolvedValue([]),
      findUserRoles: jest.fn().mockResolvedValue([]),
      userExists: jest.fn().mockResolvedValue(true),
      findRoleByKey: jest.fn().mockResolvedValue(null),
      findRoleById: jest.fn().mockResolvedValue(null),
      findDefaultRoles: jest.fn().mockResolvedValue([]),
      roleKeyOf: jest.fn().mockResolvedValue(null),
      findManualAssignment: jest.fn().mockResolvedValue(null),
      addManualAssignment: jest.fn(),
      revokeManualAssignment: jest.fn().mockResolvedValue(true),
      isLastAdministrator: jest.fn().mockResolvedValue(false),
      countActiveRoleHolders: jest.fn().mockResolvedValue(0),
      countAdministratorEquivalentUsers: jest.fn().mockResolvedValue(0),
      syncSsoAssignments: jest.fn(),
      listRoles: jest.fn().mockResolvedValue([]),
      listRolesWithUserCounts: jest.fn().mockResolvedValue([]),
      listPermissions: jest.fn().mockResolvedValue([]),
      listUnavailablePermissionKeys: jest.fn().mockResolvedValue([]),
      findKnownPermissionKeys: jest.fn().mockResolvedValue([]),
      roleKeyTaken: jest.fn().mockResolvedValue(false),
      createRole: jest.fn(),
      updateRoleDetails: jest.fn(),
      addRolePermissions: jest.fn(),
      removeRolePermissions: jest.fn(),
      reassignRoleHolders: jest.fn(),
      deleteRole: jest.fn(),
    };
    uow = createFakeUnitOfWork();
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AUDIT_RECORDER, useValue: audit },
        RbacService,
        { provide: RBAC_STORE, useValue: store },
        { provide: UNIT_OF_WORK, useValue: uow },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<RbacService>(RbacService);
  });

  return {
    get audit() {
      return audit;
    },
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    get uow() {
      return uow;
    },
    get eventEmitter() {
      return eventEmitter;
    },
  };
}
