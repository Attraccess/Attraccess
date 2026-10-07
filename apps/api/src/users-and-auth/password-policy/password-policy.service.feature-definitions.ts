import { PasswordPolicyRole } from '@attraccess/database-entities';
import { PasswordPolicyConfig, PolicyError } from '@attraccess/shared';

export const POLICY_FIELDS: Array<keyof PasswordPolicyConfig> = [
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

export interface ServerValidationResult {
  ok: boolean;
  errors: PolicyError[];
  zxcvbn: {
    score: number;
    required: number;
  };
}

export interface ValidateOptions {
  userIdForHistory?: number;
  role?: PasswordPolicyRole;
  policyOverride?: PasswordPolicyConfig;
}

export interface AuditContext {
  actorId: number | null;
  actorUsername: string | null;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId: number | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export type PartialPasswordPolicy = Partial<PasswordPolicyConfig>;
