import {
  AuthenticationDetail,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
} from '@attraccess/database-entities';
import { PasswordPolicyConfig, PublicPasswordPolicy } from '@attraccess/shared';
import { Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { RbacService } from '../rbac/rbac.service';
import { HibpClient } from './hibp.client';
import { AuditContext, PartialPasswordPolicy } from './password-policy.service.feature-definitions';
import { ZxcvbnService } from './zxcvbn.service';

export abstract class PasswordPolicyServiceRouteContext {
  public abstract ensureSeed(): Promise<void>;
  protected abstract readonly repo: Repository<PasswordPolicy>;
  protected abstract readonly logger: Logger;
  protected abstract toConfig(row: PasswordPolicy): PasswordPolicyConfig;
  public abstract getPolicy(): Promise<PasswordPolicyConfig>;
  protected abstract readonly overrideRepo: Repository<PasswordPolicyOverride>;
  protected abstract mergeOverride(base: PasswordPolicyConfig, override: PasswordPolicyOverride): PasswordPolicyConfig;
  protected abstract toPublic(policy: PasswordPolicyConfig): PublicPasswordPolicy;
  protected abstract readonly rbacService: RbacService;
  protected abstract sanitizePartial(input: PartialPasswordPolicy): PartialPasswordPolicy;
  protected abstract readonly dataSource: DataSource;
  protected abstract assertEffectiveLengthRange(
    base: PasswordPolicyConfig,
    override: PasswordPolicyOverride | null,
  ): Promise<void>;
  protected abstract persistAudit(input: {
    event: 'global_policy_updated' | 'override_upserted' | 'override_deleted';
    audit: AuditContext;
    role: PasswordPolicyRole | null;
    before: object | null;
    after: object | null;
    changedFields: string[];
  }): Promise<void>;
  protected abstract rethrowConcurrencyOrSqliteConflict(err: unknown): never;
  protected abstract sanitizeOverride(
    input: Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>,
  ): Partial<Record<keyof PasswordPolicyConfig, number | boolean | null>>;
  protected abstract snapshotOverride(row: PasswordPolicyOverride): Record<string, unknown>;
  protected abstract blankOverride(): Record<keyof PasswordPolicyConfig, null>;
  public abstract getEffectivePolicy(role?: PasswordPolicyRole): Promise<PasswordPolicyConfig>;
  protected abstract readonly zxcvbn: ZxcvbnService;
  protected abstract readonly hibp: HibpClient;
  protected abstract matchesRecentHistory(userId: number, candidate: string, historySize: number): Promise<boolean>;
  protected abstract readonly historyRepo: Repository<PasswordHistory>;
  protected abstract pruneHistory(userId: number, historySize: number): Promise<void>;
  protected abstract readonly authDetailRepo: Repository<AuthenticationDetail>;
  public abstract recordHistory(userId: number, passwordHash: string): Promise<void>;
  protected abstract readonly identityAudit?: IdentityAuditService;
}
