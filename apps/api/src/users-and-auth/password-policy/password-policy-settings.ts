import {
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  User,
} from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { DEFAULT_PASSWORD_POLICY, PasswordPolicyConfig, PublicPasswordPolicy } from '@attraccess/shared';
import { NotFoundException } from '@nestjs/common';
import { AuditContext, PartialPasswordPolicy } from './password-policy.service.feature-definitions';
import { PasswordPolicyServiceRouteContext } from './password-policy.service.route-context';
export abstract class PasswordPolicySettingsImplementation extends PasswordPolicyServiceRouteContext {
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

  public async resolveRole(user: User | null | undefined): Promise<PasswordPolicyRole | undefined> {
    if (!user) return undefined;
    const effectivePerms = (user as AuthenticatedUser).effectivePermissions;
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
      let auditInput: Parameters<typeof this.persistAudit>[0] | undefined;
      const after = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PasswordPolicy);
        const overrideRepo = manager.getRepository(PasswordPolicyOverride);

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
          auditInput = {
            event: 'global_policy_updated',
            audit,
            role: null,
            before,
            after,
            changedFields: Object.keys(sanitized),
          };
        }
        return after;
      });
      if (auditInput) await this.persistAudit(auditInput);
      return after;
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
}
