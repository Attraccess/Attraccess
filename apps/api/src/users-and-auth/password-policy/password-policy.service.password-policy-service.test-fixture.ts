import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import {
  PASSWORD_POLICY_FIELDS,
  PasswordPolicyRole,
  type PasswordPolicyOverrideRecord,
  type PasswordPolicyValues,
} from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../database/unit-of-work';
import { CREDENTIAL_STORE } from '../auth/credentials/credential-store.port';
import { RbacService } from '../rbac/rbac.service';
import { HibpClient } from './hibp.client';
import { PASSWORD_POLICY_STORE, type PasswordPolicyOverrideValues } from './password-policy-store.port';
import { PasswordPolicyService, type AuditContext } from './password-policy.service';
import { ZxcvbnService } from './zxcvbn.service';

const buildOverride = (overrides: Partial<PasswordPolicyOverrideRecord> = {}): PasswordPolicyOverrideRecord => ({
  role: PasswordPolicyRole.ADMIN,
  minLength: null,
  maxLength: null,
  allowAllUnicode: null,
  requireUppercase: null,
  requireLowercase: null,
  requireDigit: null,
  requireSpecial: null,
  checkHIBP: null,
  checkCommonPasswords: null,
  minZxcvbnScore: null,
  historySize: null,
  rotationDays: null,
  ...overrides,
});

const buildRow = (overrides: Partial<PasswordPolicyValues> = {}): PasswordPolicyValues => ({
  minLength: 12,
  maxLength: 128,
  allowAllUnicode: true,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  checkHIBP: true,
  checkCommonPasswords: true,
  minZxcvbnScore: 3,
  historySize: 0,
  rotationDays: 0,
  ...overrides,
});

/** The rows the in-memory policy store holds. Tests set them directly. */
export interface PolicyStoreState {
  policy: PasswordPolicyValues | null;
  overrides: PasswordPolicyOverrideRecord[];
}

/** A unit of work whose scope is a plain object; every run hands out the same scope. */
export function createFakeUnitOfWork(): UnitOfWork & { scope: TransactionScope } {
  const scope: TransactionScope = { isOpen: true, afterCommit: jest.fn() };
  return { scope, current: () => undefined, run: async (work) => work(scope) };
}

export function registerPasswordPolicyServiceFixture() {
  let service: PasswordPolicyService;

  const identityAudit = { record: jest.fn() };

  const audit: AuditContext = {
    actorId: 7,
    actorUsername: 'admin',
    authenticationMethod: 'api-token',
    apiTokenId: 9,
    ip: '192.0.2.7',
    userAgent: 'fixture',
    requestId: 'fixture-request',
  };

  let state: PolicyStoreState;

  let store: {
    findPolicy: jest.Mock;
    seedPolicy: jest.Mock;
    savePolicy: jest.Mock;
    listOverrides: jest.Mock;
    findOverride: jest.Mock;
    saveOverride: jest.Mock;
    deleteOverride: jest.Mock;
    recentHistoryHashes: jest.Mock;
    recordHistory: jest.Mock;
  };

  let credentials: { findLocalPasswordHash: jest.Mock };

  let unitOfWork: ReturnType<typeof createFakeUnitOfWork>;

  let hibp: { check: jest.Mock };

  let zxcvbn: { evaluate: jest.Mock };

  let rbacService: { getEffectivePermissions: jest.Mock };

  beforeEach(async () => {
    identityAudit.record.mockReset();
    state = { policy: buildRow(), overrides: [] };
    store = {
      findPolicy: jest.fn(async () => (state.policy ? { ...state.policy } : null)),
      seedPolicy: jest.fn(async (values: PasswordPolicyValues) => {
        state.policy = { ...values };
      }),
      savePolicy: jest.fn(async (changes: Partial<PasswordPolicyValues>) => {
        if (!state.policy) return null;
        state.policy = { ...state.policy, ...changes };
        return { ...state.policy };
      }),
      listOverrides: jest.fn(async () => state.overrides.map((override) => ({ ...override }))),
      findOverride: jest.fn(async (role: PasswordPolicyRole) => {
        const found = state.overrides.find((override) => override.role === role);
        return found ? { ...found } : null;
      }),
      saveOverride: jest.fn(async (role: PasswordPolicyRole, values: PasswordPolicyOverrideValues) => {
        const existing = state.overrides.find((override) => override.role === role);
        const saved = { ...(existing ?? buildOverride({ role })), ...values } as PasswordPolicyOverrideRecord;
        state.overrides = [...state.overrides.filter((override) => override.role !== role), saved];
        return { ...saved };
      }),
      deleteOverride: jest.fn(async (role: PasswordPolicyRole) => {
        const before = state.overrides.length;
        state.overrides = state.overrides.filter((override) => override.role !== role);
        return state.overrides.length < before;
      }),
      recentHistoryHashes: jest.fn(async () => [] as string[]),
      recordHistory: jest.fn(async () => undefined),
    };
    credentials = { findLocalPasswordHash: jest.fn(async () => null) };
    unitOfWork = createFakeUnitOfWork();
    hibp = { check: jest.fn(async () => ({ pwned: false, count: 0, available: true })) };
    zxcvbn = {
      evaluate: jest.fn(() => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] })),
    };
    rbacService = { getEffectivePermissions: jest.fn(async () => new Set<string>()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordPolicyService,
        { provide: AUDIT_RECORDER, useValue: identityAudit },
        { provide: PASSWORD_POLICY_STORE, useValue: store },
        { provide: CREDENTIAL_STORE, useValue: credentials },
        { provide: UNIT_OF_WORK, useValue: unitOfWork },
        { provide: HibpClient, useValue: hibp },
        { provide: ZxcvbnService, useValue: zxcvbn },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();
    service = module.get(PasswordPolicyService);
  });
  return {
    get buildOverride() {
      return buildOverride;
    },
    get buildRow() {
      return buildRow;
    },
    get fields() {
      return PASSWORD_POLICY_FIELDS;
    },
    get service() {
      return service;
    },
    get identityAudit() {
      return identityAudit;
    },
    /** The scope the unit of work hands its callback; audit rows are written with it. */
    get scope() {
      return unitOfWork.scope;
    },
    get audit() {
      return audit;
    },
    get state() {
      return state;
    },
    get store() {
      return store;
    },
    get credentials() {
      return credentials;
    },
    get hibp() {
      return hibp;
    },
    get zxcvbn() {
      return zxcvbn;
    },
    get rbacService() {
      return rbacService;
    },
  };
}
