export const PASSWORD_POLICY_SINGLETON_ID = 1;

export interface PasswordPolicy {
  id: number;
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
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
