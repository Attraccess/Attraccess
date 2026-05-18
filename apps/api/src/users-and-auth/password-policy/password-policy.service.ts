// Password policy service: fetch policy row, seed defaults, run full server validation, manage per-role overrides
// FEATURE: Password policy core orchestration (shared validator + HIBP + zxcvbn + history + role overrides)

import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  PASSWORD_POLICY_SINGLETON_ID,
  User,
} from '@attraccess/database-entities';
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

export interface ValidateOptions {
  userIdForHistory?: number;
  role?: PasswordPolicyRole;
}

export type PartialPasswordPolicy = Partial<PasswordPolicyConfig>;

@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  private readonly logger = new Logger(PasswordPolicyService.name);

  constructor(
    @InjectRepository(PasswordPolicy)
    private readonly repo: Repository<PasswordPolicy>,
    @InjectRepository(PasswordPolicyOverride)
    private readonly overrideRepo: Repository<PasswordPolicyOverride>,
    @InjectRepository(PasswordHistory)
    private readonly historyRepo: Repository<PasswordHistory>,
    @InjectRepository(AuthenticationDetail)
    private readonly authDetailRepo: Repository<AuthenticationDetail>,
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

  public async getEffectivePolicy(role?: PasswordPolicyRole): Promise<PasswordPolicyConfig> {
    const base = await this.getPolicy();
    if (!role) {
      return base;
    }
    const override = await this.overrideRepo.findOne({ where: { role } });
    if (!override) {
      return base;
    }
    return this.mergeOverride(base, override);
  }

  public async getPublicPolicy(): Promise<PublicPasswordPolicy> {
    const policy = await this.getPolicy();
    return this.toPublic(policy);
  }

  public resolveRole(user: User | null | undefined): PasswordPolicyRole | undefined {
    if (!user) {
      return undefined;
    }
    if (user.systemPermissions?.canManageSystemConfiguration) {
      return PasswordPolicyRole.ADMIN;
    }
    return undefined;
  }

  public async updatePolicy(input: PartialPasswordPolicy): Promise<PasswordPolicyConfig> {
    const before = await this.getPolicy();
    const sanitized = this.sanitizePartial(input);
    await this.repo.update({ id: PASSWORD_POLICY_SINGLETON_ID }, sanitized);
    const after = await this.getPolicy();
    this.logger.log(
      `Password policy updated: ${JSON.stringify({ before, after, changed: Object.keys(sanitized) })}`,
    );
    return after;
  }

  public async listOverrides(): Promise<PasswordPolicyOverride[]> {
    return this.overrideRepo.find({ order: { role: 'ASC' } });
  }

  public async getOverride(role: PasswordPolicyRole): Promise<PasswordPolicyOverride | null> {
    return this.overrideRepo.findOne({ where: { role } });
  }

  public async upsertOverride(
    role: PasswordPolicyRole,
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
  ): Promise<PasswordPolicyOverride> {
    const existing = await this.overrideRepo.findOne({ where: { role } });
    const sanitized = this.sanitizeOverride(input);
    if (existing) {
      const merged = this.overrideRepo.merge(existing, sanitized as Partial<PasswordPolicyOverride>);
      const saved = await this.overrideRepo.save(merged);
      this.logger.log(`Password policy override updated for role=${role}: ${JSON.stringify(sanitized)}`);
      return saved;
    }
    const created = this.overrideRepo.create({
      role,
      ...this.blankOverride(),
      ...sanitized,
    } as Partial<PasswordPolicyOverride>);
    const saved = await this.overrideRepo.save(created);
    this.logger.log(`Password policy override created for role=${role}: ${JSON.stringify(sanitized)}`);
    return saved;
  }

  public async deleteOverride(role: PasswordPolicyRole): Promise<void> {
    const existing = await this.overrideRepo.findOne({ where: { role } });
    if (!existing) {
      throw new NotFoundException(`No password policy override for role=${role}`);
    }
    await this.overrideRepo.delete({ role });
    this.logger.log(`Password policy override removed for role=${role}`);
  }

  public async validate(
    password: string,
    userCtx: PasswordUserContext = {},
    options: ValidateOptions = {},
  ): Promise<ServerValidationResult> {
    const policy = await this.getEffectivePolicy(options.role);
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

    if (policy.historySize > 0 && options.userIdForHistory) {
      const reused = await this.matchesRecentHistory(options.userIdForHistory, password, policy.historySize);
      if (reused) {
        errors.push({ code: 'PASSWORD_REUSED', params: { historySize: policy.historySize } });
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      zxcvbn: { score: zxcvbnResult.score, required: policy.minZxcvbnScore },
    };
  }

  public async recordHistory(userId: number, passwordHash: string): Promise<void> {
    const policy = await this.getPolicy();
    if (policy.historySize <= 0 || !passwordHash) {
      return;
    }

    await this.historyRepo.save(this.historyRepo.create({ userId, passwordHash }));
    await this.pruneHistory(userId, policy.historySize);
  }

  public async archiveCurrentPasswordToHistory(userId: number): Promise<void> {
    const policy = await this.getPolicy();
    if (policy.historySize <= 0) {
      return;
    }

    const currentDetail = await this.authDetailRepo.findOne({
      where: { userId, type: AuthenticationType.LOCAL_PASSWORD },
    });
    if (!currentDetail?.password) {
      return;
    }

    await this.recordHistory(userId, currentDetail.password);
  }

  private async matchesRecentHistory(userId: number, candidate: string, historySize: number): Promise<boolean> {
    const currentDetail = await this.authDetailRepo.findOne({
      where: { userId, type: AuthenticationType.LOCAL_PASSWORD },
    });
    if (currentDetail?.password && (await bcrypt.compare(candidate, currentDetail.password))) {
      return true;
    }

    const priorEntries = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: historySize,
    });

    for (const entry of priorEntries) {
      if (await bcrypt.compare(candidate, entry.passwordHash)) {
        return true;
      }
    }

    return false;
  }

  private async pruneHistory(userId: number, historySize: number): Promise<void> {
    const keep = await this.historyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: historySize,
      select: ['id'],
    });
    const keepIds = keep.map((row) => row.id);
    const builder = this.historyRepo.createQueryBuilder().delete().where('userId = :userId', { userId });
    if (keepIds.length > 0) {
      builder.andWhere('id NOT IN (:...keepIds)', { keepIds });
    }
    await builder.execute();
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

  private toPublic(policy: PasswordPolicyConfig): PublicPasswordPolicy {
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

  private mergeOverride(base: PasswordPolicyConfig, override: PasswordPolicyOverride): PasswordPolicyConfig {
    const merged: PasswordPolicyConfig = { ...base };
    const fields: Array<keyof PasswordPolicyConfig> = [
      'minLength',
      'maxLength',
      'allowAllUnicode',
      'requireUppercase',
      'requireLowercase',
      'requireDigit',
      'requireSpecial',
      'checkHIBP',
      'checkCommonPasswords',
      'minZxcvbnScore',
      'historySize',
      'rotationDays',
    ];
    for (const key of fields) {
      const value = (override as unknown as Record<string, unknown>)[key];
      if (value !== null && value !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  }

  private sanitizePartial(input: PartialPasswordPolicy): PartialPasswordPolicy {
    const out: PartialPasswordPolicy = {};
    const fields: Array<keyof PasswordPolicyConfig> = [
      'minLength',
      'maxLength',
      'allowAllUnicode',
      'requireUppercase',
      'requireLowercase',
      'requireDigit',
      'requireSpecial',
      'checkHIBP',
      'checkCommonPasswords',
      'minZxcvbnScore',
      'historySize',
      'rotationDays',
    ];
    for (const key of fields) {
      const value = input[key];
      if (value !== undefined) {
        (out as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return out;
  }

  private sanitizeOverride(
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
  ): Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>> {
    const out: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>> = {};
    const fields: Array<keyof PasswordPolicyConfig> = [
      'minLength',
      'maxLength',
      'allowAllUnicode',
      'requireUppercase',
      'requireLowercase',
      'requireDigit',
      'requireSpecial',
      'checkHIBP',
      'checkCommonPasswords',
      'minZxcvbnScore',
      'historySize',
      'rotationDays',
    ];
    for (const key of fields) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        out[key] = input[key];
      }
    }
    return out;
  }

  private blankOverride(): Record<keyof PasswordPolicyConfig, null> {
    return {
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
    };
  }
}
