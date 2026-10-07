import {
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
} from '@attraccess/database-entities';
import { PasswordPolicyConfig } from '@attraccess/shared';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OptimisticLockVersionMismatchError, QueryFailedError } from 'typeorm';
import { PasswordPolicySettingsImplementation } from './password-policy-settings';
import { AuditContext } from './password-policy.service.feature-definitions';
export abstract class PasswordPolicyOverridesImplementation extends PasswordPolicySettingsImplementation {
  public async upsertOverride(
    role: PasswordPolicyRole,
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
    audit?: AuditContext,
  ): Promise<PasswordPolicyOverride> {
    const sanitized = this.sanitizeOverride(input);
    try {
      let auditInput: Parameters<typeof this.persistAudit>[0] | undefined;
      const saved = await this.dataSource.transaction(async (manager) => {
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);
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
          auditInput = {
            event: 'override_upserted',
            audit,
            role,
            before,
            after,
            changedFields: Object.keys(sanitized),
          };
        }
        return saved;
      });
      if (auditInput) await this.persistAudit(auditInput);
      return saved;
    } catch (err) {
      this.rethrowConcurrencyOrSqliteConflict(err);
    }
  }

  public async deleteOverride(role: PasswordPolicyRole, audit?: AuditContext): Promise<void> {
    try {
      let auditInput: Parameters<typeof this.persistAudit>[0] | undefined;
      await this.dataSource.transaction(async (manager) => {
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);
        const existing = await overrideRepo.findOne({ where: { role } });
        if (!existing) {
          throw new NotFoundException(`No password policy override for role=${role}`);
        }
        const before = this.snapshotOverride(existing);
        await overrideRepo.remove(existing);
        if (audit) {
          auditInput = {
            event: 'override_deleted',
            audit,
            role,
            before,
            after: null,
            changedFields: [],
          };
        }
      });
      if (auditInput) await this.persistAudit(auditInput);
    } catch (err) {
      this.rethrowConcurrencyOrSqliteConflict(err);
    }
  }

  protected async assertEffectiveLengthRange(
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

  protected rethrowConcurrencyOrSqliteConflict(err: unknown): never {
    if (err instanceof OptimisticLockVersionMismatchError) {
      throw new ConflictException('Password policy row changed concurrently; reload and retry');
    }
    if (err instanceof QueryFailedError && /CHECK constraint failed/i.test(err.message)) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}
