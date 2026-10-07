import { oneOf, positive } from './audit-projection';
export const identityPolicies = {
  login: ['reason'],
  logout: [],
  registration: ['reason'],
  password_reset_requested: ['reason'],
  password_reset_completed: ['reason'],
  two_factor_setup_started: [],
  two_factor_enabled: [],
  two_factor_disabled: [],
  passkey_created: [],
  passkey_renamed: [],
  passkey_deleted: [],
  sso_login: ['providerId', 'reason'],
  user_created: [],
  user_updated: ['field'],
  user_deleted: [],
  user_role_assigned: ['role'],
  user_role_removed: ['role'],
  role_created: ['role'],
  role_updated: ['role'],
  role_deleted: ['role'],
  password_policy_updated: ['before', 'after', 'field'],
  password_policy_override_updated: ['role', 'before', 'after', 'field'],
  password_policy_override_deleted: ['role', 'before'],
} as const satisfies Record<string, readonly string[]>;
export const identityFields: Record<string, (value: unknown) => boolean> = {
  reason: oneOf(
    'invalid_credentials',
    'account_locked',
    'rate_limited',
    'two_factor_required',
    'two_factor_invalid',
    'email_not_verified',
    'invalid_token',
    'invalid_input',
    'unknown_user',
    'dependency_failure',
  ),
  providerId: positive,
  // RbacService truncates normalized names after joining parts, which can leave a trailing hyphen.
  role: (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value),
  field: oneOf(
    'username',
    'email',
    'password',
    'billingFactor',
    'isEmailVerified',
    'isActive',
    'role',
    'minLength',
    'maxLength',
    'allowAllUnicode',
    'requireLowercase',
    'requireUppercase',
    'requireDigit',
    'requireNumber',
    'requireSpecial',
    'checkHIBP',
    'checkCommonPasswords',
    'minZxcvbnScore',
    'historySize',
    'rotationDays',
    'zxcvbnMinScore',
    'historyCount',
  ),
  before: policySnapshot,
  after: policySnapshot,
};
export function policySnapshot(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const snapshot = JSON.parse(value);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    return Object.entries(snapshot).every(([key, entry]) => policySnapshotFields[key]?.(entry) === true);
  } catch {
    return false;
  }
}
export const nullable = (validate: (value: unknown) => boolean) => (value: unknown) =>
  value === null || validate(value);
export const integerBetween = (minimum: number, maximum: number) => (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
export const policySnapshotFields: Record<string, (value: unknown) => boolean> = {
  role: (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value),
  minLength: nullable(integerBetween(8, 1024)),
  maxLength: nullable(integerBetween(8, 1024)),
  allowAllUnicode: nullable((value) => typeof value === 'boolean'),
  requireUppercase: nullable((value) => typeof value === 'boolean'),
  requireLowercase: nullable((value) => typeof value === 'boolean'),
  requireDigit: nullable((value) => typeof value === 'boolean'),
  requireSpecial: nullable((value) => typeof value === 'boolean'),
  checkHIBP: nullable((value) => typeof value === 'boolean'),
  checkCommonPasswords: nullable((value) => typeof value === 'boolean'),
  minZxcvbnScore: nullable(integerBetween(0, 4)),
  historySize: nullable(integerBetween(0, 50)),
  rotationDays: nullable(integerBetween(0, 3650)),
};
