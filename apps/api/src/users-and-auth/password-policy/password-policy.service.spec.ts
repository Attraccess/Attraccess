import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordPolicy } from '@attraccess/database-entities';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';
import { PasswordPolicyService } from './password-policy.service';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';

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
  ...overrides,
});

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let hibp: { check: jest.Mock };
  let zxcvbn: { evaluate: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(async () => buildRow()),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };
    hibp = { check: jest.fn(async () => ({ pwned: false, count: 0, available: true })) };
    zxcvbn = { evaluate: jest.fn(() => ({ score: 4, guessesLog10: 12, crackTimesSeconds: {}, warning: '', suggestions: [] })) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordPolicyService,
        { provide: getRepositoryToken(PasswordPolicy), useValue: repo },
        { provide: HibpClient, useValue: hibp },
        { provide: ZxcvbnService, useValue: zxcvbn },
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
});
