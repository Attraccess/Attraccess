import {
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
} from '@attraccess/database-entities';
import { PasswordPolicyConfig, PublicPasswordPolicy } from '@attraccess/shared';
import { randomUUID } from 'node:crypto';
import { PasswordHistoryImplementation } from './password-history';
import { AuditContext, PartialPasswordPolicy, POLICY_FIELDS } from './password-policy.service.feature-definitions';

export abstract class PasswordPolicyProjectionImplementation extends PasswordHistoryImplementation {
  protected async persistAudit(input: {
    event: 'global_policy_updated' | 'override_upserted' | 'override_deleted';
    audit: AuditContext;
    role: PasswordPolicyRole | null;
    before: object | null;
    after: object | null;
    changedFields: string[];
  }): Promise<void> {
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
    await this.identityAudit?.record({
      action,
      operationId: randomUUID(),
      outcome: 'succeeded',
      actorId: input.audit.actorId ?? undefined,
      authenticationMethod: input.audit.authenticationMethod,
      apiTokenId: input.audit.apiTokenId ?? undefined,
      subjectType: 'identity.password_policy',
      subjectId: PASSWORD_POLICY_SINGLETON_ID,
      details,
      request: {
        ipAddress: input.audit.ip ?? undefined,
        userAgent: input.audit.userAgent ?? undefined,
      },
    });
  }

  protected toConfig(row: PasswordPolicy): PasswordPolicyConfig {
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

  protected mergeOverride(base: PasswordPolicyConfig, override: PasswordPolicyOverride): PasswordPolicyConfig {
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

  protected snapshotOverride(row: PasswordPolicyOverride): Record<string, unknown> {
    const out: Record<string, unknown> = { role: row.role };
    const source = row as unknown as Record<string, unknown>;
    for (const key of POLICY_FIELDS) {
      out[key] = source[key];
    }
    return out;
  }
}
