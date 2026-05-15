// Password policy service: fetch policy row, seed defaults, run full server validation
// FEATURE: Password policy core orchestration (shared validator + HIBP + zxcvbn)

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordPolicy, PASSWORD_POLICY_SINGLETON_ID } from '@attraccess/database-entities';
import {
  COMMON_PASSWORDS,
  DEFAULT_PASSWORD_POLICY,
  PasswordPolicyConfig,
  PasswordUserContext,
  PolicyError,
  PublicPasswordPolicy,
  validatePassword,
} from '@attraccess/shared';
import { HibpClient } from './hibp.client';
import { ZxcvbnService } from './zxcvbn.service';

export interface ServerValidationResult {
  ok: boolean;
  errors: PolicyError[];
  zxcvbn: {
    score: number;
    required: number;
  };
}

@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  private readonly logger = new Logger(PasswordPolicyService.name);

  constructor(
    @InjectRepository(PasswordPolicy)
    private readonly repo: Repository<PasswordPolicy>,
    private readonly hibp: HibpClient,
    private readonly zxcvbn: ZxcvbnService,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.ensureSeed();
  }

  public async ensureSeed(): Promise<void> {
    const existing = await this.repo.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
    if (existing) {
      return;
    }
    const seed = this.repo.create({ id: PASSWORD_POLICY_SINGLETON_ID, ...DEFAULT_PASSWORD_POLICY });
    await this.repo.save(seed);
    this.logger.log('Seeded default password policy row');
  }

  public async getPolicy(): Promise<PasswordPolicyConfig> {
    const row = await this.repo.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
    if (!row) {
      await this.ensureSeed();
      return { ...DEFAULT_PASSWORD_POLICY };
    }
    return this.toConfig(row);
  }

  public async getPublicPolicy(): Promise<PublicPasswordPolicy> {
    const policy = await this.getPolicy();
    return {
      minLength: policy.minLength,
      maxLength: policy.maxLength,
      allowAllUnicode: policy.allowAllUnicode,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireDigit: policy.requireDigit,
      requireSpecial: policy.requireSpecial,
      minZxcvbnScore: policy.minZxcvbnScore,
    };
  }

  public async validate(password: string, userCtx: PasswordUserContext = {}): Promise<ServerValidationResult> {
    const policy = await this.getPolicy();
    const baseResult = validatePassword(password, policy, userCtx, { commonPasswords: COMMON_PASSWORDS });
    const errors: PolicyError[] = [...baseResult.errors];

    const zxcvbnInputs = [userCtx.username, userCtx.email].filter((v): v is string => typeof v === 'string' && v.length > 0);
    const zxcvbnResult = this.zxcvbn.evaluate(password, zxcvbnInputs);
    if (zxcvbnResult.score < policy.minZxcvbnScore) {
      errors.push({
        code: 'ZXCVBN_SCORE',
        params: { score: zxcvbnResult.score, required: policy.minZxcvbnScore },
      });
    }

    if (policy.checkHIBP) {
      const hibp = await this.hibp.check(password);
      if (hibp.pwned) {
        errors.push({ code: 'HIBP_PWNED', params: { count: hibp.count } });
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      zxcvbn: { score: zxcvbnResult.score, required: policy.minZxcvbnScore },
    };
  }

  private toConfig(row: PasswordPolicy): PasswordPolicyConfig {
    return {
      minLength: row.minLength,
      maxLength: row.maxLength,
      allowAllUnicode: row.allowAllUnicode,
      requireUppercase: row.requireUppercase,
      requireLowercase: row.requireLowercase,
      requireDigit: row.requireDigit,
      requireSpecial: row.requireSpecial,
      checkHIBP: row.checkHIBP,
      checkCommonPasswords: row.checkCommonPasswords,
      minZxcvbnScore: row.minZxcvbnScore,
      historySize: row.historySize,
      rotationDays: row.rotationDays,
    };
  }
}
