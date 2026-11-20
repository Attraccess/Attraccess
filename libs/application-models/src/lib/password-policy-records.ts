import type { PasswordPolicyRole } from './password-policy-override';

/** The rules of a password policy, as stored for the global policy and (nullable) per role. */
export interface PasswordPolicyValues {
  minLength: number;
  maxLength: number;
  allowAllUnicode: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
  checkHIBP: boolean;
  checkCommonPasswords: boolean;
  minZxcvbnScore: number;
  historySize: number;
  rotationDays: number;
}

/** The rule names of a policy, in the order they are stored and shown. */
export const PASSWORD_POLICY_FIELDS: ReadonlyArray<keyof PasswordPolicyValues> = [
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

/** A per-role override: a null rule falls back to the global policy. */
export type PasswordPolicyOverrideRecord = { role: PasswordPolicyRole } & {
  [Key in keyof PasswordPolicyValues]: PasswordPolicyValues[Key] | null;
};
