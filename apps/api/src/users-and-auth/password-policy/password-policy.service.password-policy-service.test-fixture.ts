import {
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
} from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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

  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };

  let overrideRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    merge: jest.Mock;
    delete: jest.Mock;
  };

  let historyRepo: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  let authDetailRepo: { findOne: jest.Mock };

  let hibp: { check: jest.Mock };

  let zxcvbn: { evaluate: jest.Mock };

  let dataSource: { transaction: jest.Mock };

  let rbacService: { getEffectivePermissions: jest.Mock };

  beforeEach(async () => {
    identityAudit.record.mockReset();
    repo = {
      findOne: jest.fn(async () => buildRow()),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    overrideRepo = {
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
      merge: jest.fn((target, source) => Object.assign(target, source)),
      delete: jest.fn(async () => ({ affected: 1 })),
      remove: jest.fn(async (row) => row),
    } as never;
    const deleteBuilder = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: 0 })),
    };
    historyRepo = {
      find: jest.fn(async () => []),
      save: jest.fn(async (row) => row),
      create: jest.fn((row) => row),
      createQueryBuilder: jest.fn(() => deleteBuilder),
    };
    authDetailRepo = { findOne: jest.fn(async () => null) };
    hibp = { check: jest.fn(async () => ({ pwned: false, count: 0, available: true })) };
    zxcvbn = {
      evaluate: jest.fn(() => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] })),
    };
    const repoByEntity = new Map<unknown, unknown>([
      [PasswordPolicy, repo],
      [PasswordPolicyOverride, overrideRepo],
    ]);
    const fakeManager = {
      getRepository: (entity: unknown) => repoByEntity.get(entity) ?? {},
    };
    dataSource = {
      transaction: jest.fn(async (cb: (mgr: typeof fakeManager) => Promise<unknown>) => cb(fakeManager)),
    };
    rbacService = { getEffectivePermissions: jest.fn(async () => new Set<string>()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordPolicyService,
        { provide: IdentityAuditService, useValue: identityAudit },
        { provide: getRepositoryToken(PasswordPolicy), useValue: repo },
        { provide: getRepositoryToken(PasswordPolicyOverride), useValue: overrideRepo },
        { provide: getRepositoryToken(PasswordHistory), useValue: historyRepo },
        { provide: getRepositoryToken(AuthenticationDetail), useValue: authDetailRepo },
        { provide: DataSource, useValue: dataSource },
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
    get repo() {
      return repo;
    },
    get overrideRepo() {
      return overrideRepo;
    },
    get historyRepo() {
      return historyRepo;
    },
    get authDetailRepo() {
      return authDetailRepo;
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
