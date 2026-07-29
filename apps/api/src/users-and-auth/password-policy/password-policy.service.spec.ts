import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyAudit,
  PasswordPolicyOverride,
  PasswordPolicyRole,
} from '@attraccess/database-entities';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';
import { PasswordPolicyService } from './password-policy.service';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';
import { RbacService } from '../rbac/rbac.service';

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

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;
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
  let auditRepo: { create: jest.Mock; save: jest.Mock };
  let authDetailRepo: { findOne: jest.Mock };
  let hibp: { check: jest.Mock };
  let zxcvbn: { evaluate: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let rbacService: { getEffectivePermissions: jest.Mock };

  beforeEach(async () => {
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
    auditRepo = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };
    authDetailRepo = { findOne: jest.fn(async () => null) };
    hibp = { check: jest.fn(async () => ({ pwned: false, count: 0, available: true })) };
    zxcvbn = { evaluate: jest.fn(() => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] })) };
    const repoByEntity = new Map<unknown, unknown>([
      [PasswordPolicy, repo],
      [PasswordPolicyOverride, overrideRepo],
      [PasswordPolicyAudit, auditRepo],
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
        { provide: getRepositoryToken(PasswordPolicy), useValue: repo },
        { provide: getRepositoryToken(PasswordPolicyOverride), useValue: overrideRepo },
        { provide: getRepositoryToken(PasswordPolicyAudit), useValue: auditRepo },
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

  it('seeds defaults when no row exists', async () => {
    repo.findOne = jest.fn(async () => null);
    await service.ensureSeed();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, ...DEFAULT_PASSWORD_POLICY }));
  });

  it('returns sanitized public policy without internal flags', async () => {
    const result = await service.getPublicPolicy();
    expect(result).toEqual({
      minLength: 12,
      maxLength: 128,
      allowAllUnicode: true,
      requireUppercase: false,
      requireLowercase: false,
      requireDigit: false,
      requireSpecial: false,
      minZxcvbnScore: 3,
    });
    expect(result).not.toHaveProperty('checkHIBP');
    expect(result).not.toHaveProperty('checkCommonPasswords');
    expect(result).not.toHaveProperty('historySize');
  });

  it('rejects a weak password with structured policy errors', async () => {
    zxcvbn.evaluate = jest.fn(() => ({ score: 0, guessesLog10: 1, crackTimesSeconds: {}, warning: '', suggestions: [] }));
    const result = await service.validate('password', { username: 'alice', email: 'alice@example.com' });
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['MIN_LENGTH', 'COMMON_PASSWORD', 'ZXCVBN_SCORE']));
  });

  it('accepts a strong password (HIBP clean, score above threshold)', async () => {
    const result = await service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports HIBP pwned with count', async () => {
    hibp.check = jest.fn(async () => ({ pwned: true, count: 42, available: true }));
    const result = await service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({ code: 'HIBP_PWNED', params: { count: 42 } });
  });

  it('skips HIBP when policy.checkHIBP is false', async () => {
    repo.findOne = jest.fn(async () => buildRow({ checkHIBP: false }));
    await service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(hibp.check).not.toHaveBeenCalled();
  });

  describe('password history', () => {
    const currentPassword = 'Old-Tr0ub4dor-Hummingbird-9!plate';
    const reusedPriorPassword = 'Older-Tr0ub4dor-Hummingbird-9!plate';

    it('flags PASSWORD_REUSED when candidate matches current password hash', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      repo.findOne = jest.fn(async () => buildRow({ historySize: 3 }));
      authDetailRepo.findOne = jest.fn(async () => ({ password: currentHash, type: AuthenticationType.LOCAL_PASSWORD }));

      const result = await service.validate(
        currentPassword,
        { username: 'else', email: 'else@example.com' },
        { userIdForHistory: 7 },
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'PASSWORD_REUSED', params: { historySize: 3 } });
    });

    it('flags PASSWORD_REUSED when candidate matches a prior history entry', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      const priorHash = await bcrypt.hash(reusedPriorPassword, 4);
      repo.findOne = jest.fn(async () => buildRow({ historySize: 3 }));
      authDetailRepo.findOne = jest.fn(async () => ({ password: currentHash }));
      historyRepo.find = jest.fn(async () => [
        { id: 1, passwordHash: priorHash, userId: 7, createdAt: new Date() },
      ]);

      const result = await service.validate(
        reusedPriorPassword,
        { username: 'else', email: 'else@example.com' },
        { userIdForHistory: 7 },
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'PASSWORD_REUSED', params: { historySize: 3 } });
    });

    it('does not check history when historySize is 0', async () => {
      repo.findOne = jest.fn(async () => buildRow({ historySize: 0 }));
      await service.validate('Tr0ub4dor-Hummingbird-9!plate', {}, { userIdForHistory: 7 });
      expect(authDetailRepo.findOne).not.toHaveBeenCalled();
      expect(historyRepo.find).not.toHaveBeenCalled();
    });

    it('archiveCurrentPasswordToHistory saves the current hash and prunes', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      repo.findOne = jest.fn(async () => buildRow({ historySize: 2 }));
      authDetailRepo.findOne = jest.fn(async () => ({ password: currentHash }));

      await service.archiveCurrentPasswordToHistory(11);
      expect(historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 11, passwordHash: currentHash }));
      expect(historyRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it('archiveCurrentPasswordToHistory is a no-op when historySize is 0', async () => {
      repo.findOne = jest.fn(async () => buildRow({ historySize: 0 }));
      await service.archiveCurrentPasswordToHistory(11);
      expect(historyRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('role overrides', () => {
    it('getEffectivePolicy returns base when no role provided', async () => {
      const effective = await service.getEffectivePolicy();
      expect(effective.minLength).toBe(12);
      expect(overrideRepo.findOne).not.toHaveBeenCalled();
    });

    it('getEffectivePolicy returns base when no override row exists', async () => {
      const effective = await service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(12);
      expect(overrideRepo.findOne).toHaveBeenCalledWith({ where: { role: PasswordPolicyRole.ADMIN } });
    });

    it('getEffectivePolicy merges override fields over base', async () => {
      overrideRepo.findOne = jest.fn(async () =>
        buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 24, requireSpecial: true }),
      );
      const effective = await service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(24);
      expect(effective.requireSpecial).toBe(true);
      expect(effective.maxLength).toBe(128);
    });

    it('null override fields fall back to base', async () => {
      overrideRepo.findOne = jest.fn(async () =>
        buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 20 }),
      );
      const effective = await service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(20);
      expect(effective.requireUppercase).toBe(false);
    });

    it('validate honours role-specific policy via getEffectivePolicy', async () => {
      overrideRepo.findOne = jest.fn(async () =>
        buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 24 }),
      );
      const result = await service.validate(
        'short-pw-1A!',
        { username: 'a', email: 'a@x.de' },
        { role: PasswordPolicyRole.ADMIN },
      );
      expect(result.errors.map((e) => e.code)).toContain('MIN_LENGTH');
    });

    it('upsertOverride creates a new row with null defaults plus provided fields', async () => {
      overrideRepo.findOne = jest.fn(async () => null);
      await service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32 });
      expect(overrideRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: PasswordPolicyRole.ADMIN,
          minLength: 32,
          maxLength: null,
        }),
      );
    });

    it('upsertOverride merges into existing row', async () => {
      const existing = buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 16 });
      overrideRepo.findOne = jest.fn(async () => existing);
      await service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32, requireSpecial: true });
      expect(overrideRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ minLength: 32, requireSpecial: true }),
      );
    });

    it('upsertOverride rejects when post-merge minLength exceeds global maxLength', async () => {
      repo.findOne = jest.fn(async () => buildRow({ minLength: 12, maxLength: 16 }));
      overrideRepo.findOne = jest.fn(async () => null);
      await expect(service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32 })).rejects.toThrow(
        /minLength/,
      );
    });

    it('updatePolicy rejects when new global minLength exceeds existing override maxLength', async () => {
      const existing = buildOverride({ role: PasswordPolicyRole.ADMIN, maxLength: 16 });
      repo.findOne = jest.fn(async () => buildRow());
      overrideRepo.find = jest.fn(async () => [existing]);
      await expect(service.updatePolicy({ minLength: 32 })).rejects.toThrow(/minLength/);
    });

    it('deleteOverride throws when role has no override row', async () => {
      overrideRepo.findOne = jest.fn(async () => null);
      await expect(service.deleteOverride(PasswordPolicyRole.ADMIN)).rejects.toThrow();
    });

    it('resolveRole returns admin for request-bound users with system.settings.manage permission', async () => {
      const role = await service.resolveRole({
        effectivePermissions: new Set(['system.settings.manage']),
      } as never);
      expect(role).toBe(PasswordPolicyRole.ADMIN);
    });

    it('resolveRole returns undefined for request-bound users without system.settings.manage', async () => {
      const role = await service.resolveRole({
        effectivePermissions: new Set<string>(),
      } as never);
      expect(role).toBeUndefined();
    });

    it('resolveRole queries DB for plain DB-loaded users and returns admin when they have the permission', async () => {
      rbacService.getEffectivePermissions = jest.fn(async () => new Set(['system.settings.manage']));
      const role = await service.resolveRole({ id: 42 } as never);
      expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(42);
      expect(role).toBe(PasswordPolicyRole.ADMIN);
    });

    it('resolveRole queries DB for plain DB-loaded users and returns undefined when they lack the permission', async () => {
      rbacService.getEffectivePermissions = jest.fn(async () => new Set<string>());
      const role = await service.resolveRole({ id: 42 } as never);
      expect(role).toBeUndefined();
    });
  });

  describe('updatePolicy (hot reload)', () => {
    it('persists partial updates and returns the next read from DB', async () => {
      let state = buildRow();
      repo.findOne = jest.fn(async () => state);
      repo.save = jest.fn(async (row) => {
        state = { ...state, ...row };
        return state;
      });
      const after = await service.updatePolicy({ minLength: 20, requireUppercase: true });
      expect(after.minLength).toBe(20);
      expect(after.requireUppercase).toBe(true);
    });

    it('next validate() call sees the freshly written policy (no cache)', async () => {
      let state = buildRow();
      repo.findOne = jest.fn(async () => state);
      repo.save = jest.fn(async (row) => {
        state = { ...state, ...row };
        return state;
      });
      await service.updatePolicy({ minLength: 50 });
      const result = await service.validate('Tr0ub4dor-Hummingbird-9!plate', {
        username: 'else',
        email: 'else@example.com',
      });
      expect(result.errors.map((e) => e.code)).toContain('MIN_LENGTH');
    });
  });
});
