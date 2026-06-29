// Password policy service: fetch policy row, seed defaults, run full server validation, manage per-role overrides
// FEATURE: Password policy core orchestration (shared validator + HIBP + zxcvbn + history + role overrides)

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, OptimisticLockVersionMismatchError, QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyAudit,
  PasswordPolicyAuditEvent,
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
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

export const POLICY_FIELDS: Array<keyof PasswordPolicyConfig> = [
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
  policyOverride?: PasswordPolicyConfig;
}

export interface AuditContext {
  actorId: number | null;
  actorUsername: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
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
    @InjectRepository(PasswordPolicyAudit)
    private readonly auditRepo: Repository<PasswordPolicyAudit>,
    @InjectRepository(PasswordHistory)
    private readonly historyRepo: Repository<PasswordHistory>,
    @InjectRepository(AuthenticationDetail)
    private readonly authDetailRepo: Repository<AuthenticationDetail>,
    private readonly dataSource: DataSource,
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
    if (!user) return undefined;
    // effectivePermissions is attached for request-bound users; DB-loaded users default to normal policy
    const effectivePerms = (user as AuthenticatedUser).effectivePermissions;
    if (effectivePerms?.has('system.settings.manage')) {
      return PasswordPolicyRole.ADMIN;
    }
    return undefined;
  }

  public async updatePolicy(
    input: PartialPasswordPolicy,
    audit?: AuditContext,
  ): Promise<PasswordPolicyConfig> {
    const sanitized = this.sanitizePartial(input);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PasswordPolicy);
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);
        const auditRepo = manager.getRepository(PasswordPolicyAudit);

        const row = await repo.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
        if (!row) {
          throw new NotFoundException('Password policy singleton row missing');
        }
        const before = this.toConfig(row);
        Object.assign(row, sanitized);
        const saved = await repo.save(row);
        const after = this.toConfig(saved);

        await this.assertEffectiveLengthRange(after, null);
        for (const override of await overrideRepo.find()) {
          await this.assertEffectiveLengthRange(after, override);
        }

        if (audit) {
          await this.persistAudit(auditRepo, {
            event: PasswordPolicyAuditEvent.GLOBAL_POLICY_UPDATED,
            audit,
            role: null,
            before,
            after,
            changedFields: Object.keys(sanitized),
          });
        }
        return after;
      });
    } catch (err) {
      this.rethrowConcurrencyOrSqliteConflict(err);
    }
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
    audit?: AuditContext,
  ): Promise<PasswordPolicyOverride> {
    const sanitized = this.sanitizeOverride(input);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);
        const auditRepo = manager.getRepository(PasswordPolicyAudit);
        const policy = await manager.getRepository(PasswordPolicy).findOne({
          where: { id: PASSWORD_POLICY_SINGLETON_ID },
        });
        if (!policy) {
          throw new NotFoundException('Password policy singleton row missing');
        }
        const base = this.toConfig(policy);

        const existing = await overrideRepo.findOne({ where: { role } });
        const before = existing ? this.snapshotOverride(existing) : null;

        let saved: PasswordPolicyOverride;
        if (existing) {
          Object.assign(existing, sanitized);
          saved = await overrideRepo.save(existing);
        } else {
          const blank = overrideRepo.create({
            role,
            ...this.blankOverride(),
            ...sanitized,
          } as Partial<PasswordPolicyOverride>);
          saved = await overrideRepo.save(blank);
        }

        await this.assertEffectiveLengthRange(base, saved);

        const after = this.snapshotOverride(saved);
        if (audit) {
          await this.persistAudit(auditRepo, {
            event: PasswordPolicyAuditEvent.OVERRIDE_UPSERTED,
            audit,
            role,
            before,
            after,
            changedFields: Object.keys(sanitized),
          });
        }
        return saved;
      });
    } catch (err) {
      this.rethrowConcurrencyOrSqliteConflict(err);
    }
  }

  public async deleteOverride(role: PasswordPolicyRole, audit?: AuditContext): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);
        const auditRepo = manager.getRepository(PasswordPolicyAudit);
        const existing = await overrideRepo.findOne({ where: { role } });
        if (!existing) {
          throw new NotFoundException(`No password policy override for role=${role}`);
        }
        const before = this.snapshotOverride(existing);
        await overrideRepo.remove(existing);
        if (audit) {
          await this.persistAudit(auditRepo, {
            event: PasswordPolicyAuditEvent.OVERRIDE_DELETED,
            audit,
            role,
            before,
            after: null,
            changedFields: [],
          });
        }
      });
    } catch (err) {
      this.rethrowConcurrencyOrSqliteConflict(err);
    }
  }

  public async validate(
    password: string,
    userCtx: PasswordUserContext = {},
    options: ValidateOptions = {},
  ): Promise<ServerValidationResult> {
    const policy = options.policyOverride ?? (await this.getEffectivePolicy(options.role));
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

  private async assertEffectiveLengthRange(
    base: PasswordPolicyConfig,
    override: PasswordPolicyOverride | null,
  ): Promise<void> {
    const merged = override ? this.mergeOverride(base, override) : base;
    if (merged.minLength > merged.maxLength) {
      const label = override ? `role=${override.role}` : 'global';
      throw new BadRequestException(
        `Effective minLength (${merged.minLength}) must be <= maxLength (${merged.maxLength}) for ${label}`,
      );
    }
  }

  private async persistAudit(
    repo: Repository<PasswordPolicyAudit>,
    input: {
      event: PasswordPolicyAuditEvent;
      audit: AuditContext;
      role: PasswordPolicyRole | null;
      before: object | null;
      after: object | null;
      changedFields: string[];
    },
  ): Promise<void> {
    const entity = repo.create({
      event: input.event,
      actorId: input.audit.actorId,
      actorUsername: input.audit.actorUsername,
      ip: input.audit.ip,
      userAgent: input.audit.userAgent,
      requestId: input.audit.requestId,
      role: input.role,
      before: input.before ? JSON.stringify(input.before) : null,
      after: input.after ? JSON.stringify(input.after) : null,
      changedFields: input.changedFields.length > 0 ? JSON.stringify(input.changedFields) : null,
    });
    await repo.save(entity);
  }

  private rethrowConcurrencyOrSqliteConflict(err: unknown): never {
    if (err instanceof OptimisticLockVersionMismatchError) {
      throw new ConflictException('Password policy row changed concurrently; reload and retry');
    }
    if (err instanceof QueryFailedError && /CHECK constraint failed/i.test(err.message)) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }

  private toConfig(row: PasswordPolicy): PasswordPolicyConfig {
    const out: Record<string, unknown> = {};
    const source = row as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      out[key] = source[key];
    }
    return out as unknown as PasswordPolicyConfig;
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
    const merged: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
    const source = override as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      const value = source[key];
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }
    return merged as unknown as PasswordPolicyConfig;
  }

  private sanitizePartial(input: PartialPasswordPolicy): PartialPasswordPolicy {
    const out: Record<string, unknown> = {};
    const source = input as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      const value = source[key];
      if (value !== undefined) {
        out[key] = value;
      }
    }
    return out as PartialPasswordPolicy;
  }

  private sanitizeOverride(
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
  ): Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>> {
    const out: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>> = {};
    for (const key of POLICY_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        out[key] = input[key];
      }
    }
    return out;
  }

  private blankOverride(): Record<keyof PasswordPolicyConfig, null> {
    const out = {} as Record<keyof PasswordPolicyConfig, null>;
    for (const key of POLICY_FIELDS) {
      out[key] = null;
    }
    return out;
  }

  private snapshotOverride(row: PasswordPolicyOverride): Record<string, unknown> {
    const out: Record<string, unknown> = { role: row.role };
    const source = row as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      out[key] = source[key];
    }
    return out;
  }
}
