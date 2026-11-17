import {
  PASSWORD_POLICY_FIELDS,
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordPolicyRole,
  type PasswordPolicyOverrideRecord,
  type PasswordPolicyValues,
} from '@attraccess/application-models';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';

import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../database/unit-of-work';

import { CREDENTIAL_STORE, CredentialStore } from '../auth/credentials/credential-store.port';

import {
  PASSWORD_POLICY_STORE,
  PasswordPolicyConflictError,
  PasswordPolicyConstraintError,
  PasswordPolicyStore,
} from './password-policy-store.port';

import { RbacService } from '../rbac/rbac.service';

import { HibpClient } from './hibp.client';

import { ZxcvbnService } from './zxcvbn.service';

import {
  PasswordPolicyConfig,
  PublicPasswordPolicy,
  COMMON_PASSWORDS,
  PasswordUserContext,
  PolicyError,
  validatePassword,
  DEFAULT_PASSWORD_POLICY,
} from '@attraccess/shared';

import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import type { AuthenticationMethod } from '@attraccess/database-entities';

export const POLICY_FIELDS: Array<keyof PasswordPolicyConfig> = [...PASSWORD_POLICY_FIELDS];

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
  authenticationMethod: AuthenticationMethod;
  apiTokenId: number | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export type PartialPasswordPolicy = Partial<PasswordPolicyConfig>;

@Injectable()
export class PasswordPolicyService implements OnModuleInit {
  constructor(
    @Inject(PASSWORD_POLICY_STORE) protected readonly store: PasswordPolicyStore,
    @Inject(CREDENTIAL_STORE) protected readonly credentials: CredentialStore,
    @Inject(UNIT_OF_WORK) protected readonly unitOfWork: UnitOfWork,
    protected readonly hibp: HibpClient,
    protected readonly zxcvbn: ZxcvbnService,
    protected readonly rbacService: RbacService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(PasswordPolicyService.name);

  protected async persistAudit(
    input: {
      event: 'global_policy_updated' | 'override_upserted' | 'override_deleted';
      audit: AuditContext;
      role: PasswordPolicyRole | null;
      before: object | null;
      after: object | null;
      changedFields: string[];
    },
    transaction: TransactionScope,
  ): Promise<void> {
    const action =
      input.event === 'global_policy_updated'
        ? 'password_policy_updated'
        : input.event === 'override_deleted'
          ? 'password_policy_override_deleted'
          : 'password_policy_override_updated';
    const details: Record<string, string> = {};
    if (input.role) details.role = input.role;
    if (input.before) details.before = JSON.stringify(input.before);
    if (input.after) details.after = JSON.stringify(input.after);
    if (input.changedFields.length === 1) details.field = input.changedFields[0];
    await this.audit.record(
      {
        domain: 'identity',
        action: `identity.${action}`,
        operationId: randomUUID(),
        outcome: 'succeeded',
        actor: {
          id: input.audit.actorId,
          authenticationMethod: input.audit.authenticationMethod,
          apiTokenId: input.audit.apiTokenId,
        },
        subject: { type: 'identity.password_policy', id: PASSWORD_POLICY_SINGLETON_ID },
        details,
        request: {
          ipAddress: input.audit.ip ?? undefined,
          userAgent: input.audit.userAgent ?? undefined,
        },
      },
      transaction,
    );
  }

  protected toConfig(row: PasswordPolicyValues): PasswordPolicyConfig {
    const out: Record<string, unknown> = {};
    const source = row as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      out[key] = source[key];
    }
    return out as unknown as PasswordPolicyConfig;
  }

  protected toPublic(policy: PasswordPolicyConfig): PublicPasswordPolicy {
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

  protected mergeOverride(base: PasswordPolicyConfig, override: PasswordPolicyOverrideRecord): PasswordPolicyConfig {
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

  protected sanitizePartial(input: PartialPasswordPolicy): PartialPasswordPolicy {
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

  protected sanitizeOverride(
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

  protected blankOverride(): Record<keyof PasswordPolicyConfig, null> {
    const out = {} as Record<keyof PasswordPolicyConfig, null>;
    for (const key of POLICY_FIELDS) {
      out[key] = null;
    }
    return out;
  }

  protected snapshotOverride(row: PasswordPolicyOverrideRecord): Record<string, unknown> {
    const out: Record<string, unknown> = { role: row.role };
    const source = row as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      out[key] = source[key];
    }
    return out;
  }

  public async validate(
    password: string,
    userCtx: PasswordUserContext = {},
    options: ValidateOptions = {},
  ): Promise<ServerValidationResult> {
    const policy = options.policyOverride ?? (await this.getEffectivePolicy(options.role));
    const baseResult = validatePassword(password, policy, userCtx, { commonPasswords: COMMON_PASSWORDS });
    const errors: PolicyError[] = [...baseResult.errors];

    const zxcvbnInputs = [userCtx.username, userCtx.email].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
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

    await this.store.recordHistory(userId, passwordHash, policy.historySize);
  }

  /**
   * Archives the user's current password to the history on its own. A password change archives it atomically with
   * the change itself (see CredentialStore.replaceLocalPassword), so callers of a change do not need this.
   */
  public async archiveCurrentPasswordToHistory(userId: number): Promise<void> {
    const currentHash = await this.credentials.findLocalPasswordHash(userId);
    if (currentHash) await this.recordHistory(userId, currentHash);
  }

  protected async matchesRecentHistory(userId: number, candidate: string, historySize: number): Promise<boolean> {
    const currentHash = await this.credentials.findLocalPasswordHash(userId);
    if (currentHash && (await bcrypt.compare(candidate, currentHash))) {
      return true;
    }

    for (const hash of await this.store.recentHistoryHashes(userId, historySize)) {
      if (await bcrypt.compare(candidate, hash)) {
        return true;
      }
    }

    return false;
  }

  public async upsertOverride(
    role: PasswordPolicyRole,
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
    audit?: AuditContext,
  ): Promise<PasswordPolicyOverrideRecord> {
    const sanitized = this.sanitizeOverride(input);
    try {
      return await this.unitOfWork.run(async (scope) => {
        const policy = await this.store.findPolicy(scope);
        if (!policy) {
          throw new NotFoundException('Password policy singleton row missing');
        }
        const base = this.toConfig(policy);

        const existing = await this.store.findOverride(role, scope);
        const before = existing ? this.snapshotOverride(existing) : null;

        const saved = await this.store.saveOverride(role, sanitized, scope);

        await this.assertEffectiveLengthRange(base, saved);

        // Inside the transaction: the audit row commits or rolls back with the change.
        if (audit) {
          await this.persistAudit(
            {
              event: 'override_upserted',
              audit,
              role,
              before,
              after: this.snapshotOverride(saved),
              changedFields: Object.keys(sanitized),
            },
            scope,
          );
        }
        return saved;
      });
    } catch (err) {
      this.rethrowConcurrencyOrConstraintConflict(err);
    }
  }

  public async deleteOverride(role: PasswordPolicyRole, audit?: AuditContext): Promise<void> {
    try {
      await this.unitOfWork.run(async (scope) => {
        const existing = await this.store.findOverride(role, scope);
        if (!existing) {
          throw new NotFoundException(`No password policy override for role=${role}`);
        }
        await this.store.deleteOverride(role, scope);
        if (audit) {
          await this.persistAudit(
            {
              event: 'override_deleted',
              audit,
              role,
              before: this.snapshotOverride(existing),
              after: null,
              changedFields: [],
            },
            scope,
          );
        }
      });
    } catch (err) {
      this.rethrowConcurrencyOrConstraintConflict(err);
    }
  }

  protected async assertEffectiveLengthRange(
    base: PasswordPolicyConfig,
    override: PasswordPolicyOverrideRecord | null,
  ): Promise<void> {
    const merged = override ? this.mergeOverride(base, override) : base;
    if (merged.minLength > merged.maxLength) {
      const label = override ? `role=${override.role}` : 'global';
      throw new BadRequestException(
        `Effective minLength (${merged.minLength}) must be <= maxLength (${merged.maxLength}) for ${label}`,
      );
    }
  }

  protected rethrowConcurrencyOrConstraintConflict(err: unknown): never {
    if (err instanceof PasswordPolicyConflictError) {
      throw new ConflictException('Password policy row changed concurrently; reload and retry');
    }
    if (err instanceof PasswordPolicyConstraintError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }

  public async onModuleInit(): Promise<void> {
    await this.ensureSeed();
  }

  public async ensureSeed(): Promise<void> {
    if (await this.store.findPolicy()) {
      return;
    }
    await this.store.seedPolicy({ ...DEFAULT_PASSWORD_POLICY });
    this.logger.log('Seeded default password policy row');
  }

  public async getPolicy(): Promise<PasswordPolicyConfig> {
    const row = await this.store.findPolicy();
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
    const override = await this.store.findOverride(role);
    if (!override) {
      return base;
    }
    return this.mergeOverride(base, override);
  }

  public async getPublicPolicy(): Promise<PublicPasswordPolicy> {
    const policy = await this.getPolicy();
    return this.toPublic(policy);
  }

  public async resolveRole(user: { id: number } | null | undefined): Promise<PasswordPolicyRole | undefined> {
    if (!user) return undefined;
    const effectivePerms = (user as Partial<AuthenticatedUser>).effectivePermissions;
    if (effectivePerms !== undefined) {
      // request-bound user: use pre-computed permissions (no extra DB query)
      return effectivePerms.has('system.settings.manage') ? PasswordPolicyRole.ADMIN : undefined;
    }
    // DB-loaded user: query permissions so admin policy applies to password resets / invitations
    const perms = await this.rbacService.getEffectivePermissions(user.id);
    return perms.has('system.settings.manage') ? PasswordPolicyRole.ADMIN : undefined;
  }

  public async updatePolicy(input: PartialPasswordPolicy, audit?: AuditContext): Promise<PasswordPolicyConfig> {
    const sanitized = this.sanitizePartial(input);
    try {
      return await this.unitOfWork.run(async (scope) => {
        const current = await this.store.findPolicy(scope);
        if (!current) {
          throw new NotFoundException('Password policy singleton row missing');
        }
        const before = this.toConfig(current);
        const saved = await this.store.savePolicy(sanitized, scope);
        if (!saved) {
          throw new NotFoundException('Password policy singleton row missing');
        }
        const after = this.toConfig(saved);

        await this.assertEffectiveLengthRange(after, null);
        for (const override of await this.store.listOverrides(scope)) {
          await this.assertEffectiveLengthRange(after, override);
        }

        if (audit) {
          await this.persistAudit(
            {
              event: 'global_policy_updated',
              audit,
              role: null,
              before,
              after,
              changedFields: Object.keys(sanitized),
            },
            scope,
          );
        }
        return after;
      });
    } catch (err) {
      this.rethrowConcurrencyOrConstraintConflict(err);
    }
  }

  public async listOverrides(): Promise<PasswordPolicyOverrideRecord[]> {
    return this.store.listOverrides();
  }

  public async getOverride(role: PasswordPolicyRole): Promise<PasswordPolicyOverrideRecord | null> {
    return this.store.findOverride(role);
  }
}
