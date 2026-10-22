import type {
  PasswordPolicy,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  PasswordHistory,
} from '@attraccess/application-models';
import type { PasswordPolicyConfig } from '@attraccess/shared';
import { operationToken } from '../../../database/transaction-scope';
export class PasswordPolicyStorageError extends Error {
  constructor(
    readonly kind: 'concurrent-change' | 'invalid-policy',
    message: string,
  ) {
    super(message);
  }
}
export type NewPasswordPolicy = PasswordPolicyConfig & { id: number };
export type PolicyOverrideDraft = Pick<PasswordPolicyOverride, 'role'> & Partial<PasswordPolicyOverride>;
export abstract class PasswordPolicyOperations {
  abstract policy(): Promise<PasswordPolicy | null>;
  abstract override(role: PasswordPolicyRole): Promise<PasswordPolicyOverride | null>;
  abstract overrides(ordered?: boolean): Promise<PasswordPolicyOverride[]>;
  abstract savePolicy(policy: PasswordPolicy | NewPasswordPolicy): Promise<PasswordPolicy>;
  abstract saveOverride(
    override: PasswordPolicyOverride | PolicyOverrideDraft,
    create?: boolean,
  ): Promise<PasswordPolicyOverride>;
  abstract removeOverride(override: PasswordPolicyOverride): Promise<void>;
}
export const PASSWORD_POLICY_WRITES = operationToken<PasswordPolicyOperations>('password-policy-writes', [
  'policy',
  'override',
  'overrides',
  'savePolicy',
  'saveOverride',
  'removeOverride',
]);
export abstract class PasswordPolicyPersistence extends PasswordPolicyOperations {
  abstract recordHistory(userId: number, passwordHash: string): Promise<void>;
  abstract currentPassword(userId: number): Promise<string | null>;
  abstract recentHistory(userId: number, limit: number): Promise<PasswordHistory[]>;
  abstract historyIdsToKeep(userId: number, limit: number): Promise<number[]>;
  abstract deleteOtherHistory(userId: number, keepIds: readonly number[]): Promise<void>;
}
