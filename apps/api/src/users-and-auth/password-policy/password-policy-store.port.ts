import type {
  PasswordPolicyOverrideRecord,
  PasswordPolicyRole,
  PasswordPolicyValues,
} from '@attraccess/application-models';
import type { TransactionScope } from '../../database/unit-of-work';

/** DI token for the {@link PasswordPolicyStore}. */
export const PASSWORD_POLICY_STORE = Symbol.for('attraccess.auth.password-policy-store');

/** The database rejected a rule combination (a CHECK constraint). The message is safe to show. */
export class PasswordPolicyConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyConstraintError';
  }
}

/** The policy row changed under a concurrent writer; reload and retry. */
export class PasswordPolicyConflictError extends Error {
  constructor() {
    super('Password policy row changed concurrently');
    this.name = 'PasswordPolicyConflictError';
  }
}

export type PasswordPolicyOverrideValues = Partial<Record<keyof PasswordPolicyValues, number | boolean | null>>;

/**
 * Where the global password policy, its per-role overrides and the password history live. Writes take the scope of the
 * unit of work they belong to; the store throws {@link PasswordPolicyConstraintError} and
 * {@link PasswordPolicyConflictError} for the two rejections the application maps to HTTP answers.
 */
export interface PasswordPolicyStore {
  findPolicy(scope?: TransactionScope): Promise<PasswordPolicyValues | null>;
  /** Creates the policy row with these values unless it exists. */
  seedPolicy(values: PasswordPolicyValues): Promise<void>;
  /** Applies the changes to the policy row and returns the result; null when the row does not exist. */
  savePolicy(changes: Partial<PasswordPolicyValues>, scope: TransactionScope): Promise<PasswordPolicyValues | null>;
  listOverrides(scope?: TransactionScope): Promise<PasswordPolicyOverrideRecord[]>;
  findOverride(role: PasswordPolicyRole, scope?: TransactionScope): Promise<PasswordPolicyOverrideRecord | null>;
  /** Creates the override (every rule not given stays null) or applies the given rules to the existing one. */
  saveOverride(
    role: PasswordPolicyRole,
    values: PasswordPolicyOverrideValues,
    scope: TransactionScope,
  ): Promise<PasswordPolicyOverrideRecord>;
  /** Removes the override; false when there was none. */
  deleteOverride(role: PasswordPolicyRole, scope: TransactionScope): Promise<boolean>;
  /** The hashes of the user's last `limit` retired passwords, newest first. */
  recentHistoryHashes(userId: number, limit: number): Promise<string[]>;
  /** Appends a retired password hash and prunes the history to `keep` entries. */
  recordHistory(userId: number, passwordHash: string, keep: number, scope?: TransactionScope): Promise<void>;
}
