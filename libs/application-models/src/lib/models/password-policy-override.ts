// Per-role password policy override; nullable columns inherit from global singleton policy
// FEATURE: Password policy per-role overrides (admin only; machine/api-token are future slices)

export enum PasswordPolicyRole {
  ADMIN = 'admin',
}

export const PASSWORD_POLICY_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

export interface PasswordPolicyOverride {
  role: PasswordPolicyRole;
  minLength: number | null;
  maxLength: number | null;
  allowAllUnicode: boolean | null;
  requireUppercase: boolean | null;
  requireLowercase: boolean | null;
  requireDigit: boolean | null;
  requireSpecial: boolean | null;
  checkHIBP: boolean | null;
  checkCommonPasswords: boolean | null;
  minZxcvbnScore: number | null;
  historySize: number | null;
  rotationDays: number | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
