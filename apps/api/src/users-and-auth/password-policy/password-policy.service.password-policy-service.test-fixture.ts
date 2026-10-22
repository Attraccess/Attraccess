import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { PASSWORD_POLICY_WRITES } from './persistence/port';
import { DatabaseTransactions } from '../../database/transaction-scope';
import { PasswordPolicyPersistence } from './persistence/port';
import { PasswordPolicy, PasswordPolicyOverride, PasswordPolicyRole } from '@attraccess/application-models';
import { Test, TestingModule } from '@nestjs/testing';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { RbacService } from '../rbac/rbac.service';
import { HibpClient } from './hibp.client';
import { PasswordPolicyService, type AuditContext } from './password-policy.service';
import { ZxcvbnService } from './zxcvbn.service';

const buildOverride = (overrides: Partial<PasswordPolicyOverride>): PasswordPolicyOverride => ({
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
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  ...overrides,
});

const buildRow = (overrides: Partial<PasswordPolicy> = {}): PasswordPolicy => ({
  id: 1,
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
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  ...overrides,
});
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

  let persistence: jest.Mocked<PasswordPolicyPersistence>;
  let hibp: { check: jest.Mock };

  let zxcvbn: { evaluate: jest.Mock };

  let rbacService: { getEffectivePermissions: jest.Mock };

  beforeEach(async () => {
    identityAudit.record.mockReset();
    persistence = {
      policy: jest.fn(async () => buildRow()),
      override: jest.fn().mockResolvedValue(null),
      overrides: jest.fn().mockResolvedValue([]),
      savePolicy: jest.fn(async (row) => row as PasswordPolicy),
      saveOverride: jest.fn(async (row) => row as PasswordPolicyOverride),
      removeOverride: jest.fn(),
      recordHistory: jest.fn(),
      currentPassword: jest.fn().mockResolvedValue(null),
      recentHistory: jest.fn().mockResolvedValue([]),
      historyIdsToKeep: jest.fn().mockResolvedValue([]),
      deleteOtherHistory: jest.fn(),
    };
    hibp = { check: jest.fn(async () => ({ pwned: false, count: 0, available: true })) };
    zxcvbn = {
      evaluate: jest.fn(() => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] })),
    };
    const driver = operationTransactionsFake();
    driver.bind(PASSWORD_POLICY_WRITES, persistence);
    rbacService = { getEffectivePermissions: jest.fn(async () => new Set<string>()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordPolicyService,
        { provide: PasswordPolicyPersistence, useValue: persistence },
        { provide: DatabaseTransactions, useValue: driver.transactions },
        { provide: IdentityAuditService, useValue: identityAudit },
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
    get service() {
      return service;
    },
    get identityAudit() {
      return identityAudit;
    },
    get audit() {
      return audit;
    },
    get persistence() {
      return persistence;
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
