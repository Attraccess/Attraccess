export interface PasswordPolicyConfig {
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

export const DEFAULT_PASSWORD_POLICY: PasswordPolicyConfig = {
  minLength: 12,
  maxLength: 128,
  allowAllUnicode: true,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  checkHIBP: true,
  checkCommonPasswords: true,
  minZxcvbnScore: 3,
  historySize: 0,
  rotationDays: 0,
};

export type PublicPasswordPolicy = Pick<
  PasswordPolicyConfig,
  | 'minLength'
  | 'maxLength'
  | 'allowAllUnicode'
  | 'requireUppercase'
  | 'requireLowercase'
  | 'requireDigit'
  | 'requireSpecial'
  | 'minZxcvbnScore'
>;

export type PolicyErrorCode =
  | 'MIN_LENGTH'
  | 'MAX_LENGTH'
  | 'MISSING_UPPER'
  | 'MISSING_LOWER'
  | 'MISSING_DIGIT'
  | 'MISSING_SPECIAL'
  | 'DISALLOWED_CHARACTER'
  | 'SIMILAR_TO_EMAIL'
  | 'SIMILAR_TO_USERNAME'
  | 'COMMON_PASSWORD'
  | 'HIBP_PWNED'
  | 'ZXCVBN_SCORE';

export interface MinLengthError {
  code: 'MIN_LENGTH';
  params: { min: number; actual: number };
}

export interface MaxLengthError {
  code: 'MAX_LENGTH';
  params: { max: number; actual: number };
}

export interface MissingUpperError {
  code: 'MISSING_UPPER';
  params: Record<string, never>;
}

export interface MissingLowerError {
  code: 'MISSING_LOWER';
  params: Record<string, never>;
}

export interface MissingDigitError {
  code: 'MISSING_DIGIT';
  params: Record<string, never>;
}

export interface MissingSpecialError {
  code: 'MISSING_SPECIAL';
  params: Record<string, never>;
}

export interface DisallowedCharacterError {
  code: 'DISALLOWED_CHARACTER';
  params: Record<string, never>;
}

export interface SimilarToEmailError {
  code: 'SIMILAR_TO_EMAIL';
  params: Record<string, never>;
}

export interface SimilarToUsernameError {
  code: 'SIMILAR_TO_USERNAME';
  params: Record<string, never>;
}

export interface CommonPasswordError {
  code: 'COMMON_PASSWORD';
  params: Record<string, never>;
}

export interface HibpPwnedError {
  code: 'HIBP_PWNED';
  params: { count?: number };
}

export interface ZxcvbnScoreError {
  code: 'ZXCVBN_SCORE';
  params: { score: number; required: number };
}

export type PolicyError =
  | MinLengthError
  | MaxLengthError
  | MissingUpperError
  | MissingLowerError
  | MissingDigitError
  | MissingSpecialError
  | DisallowedCharacterError
  | SimilarToEmailError
  | SimilarToUsernameError
  | CommonPasswordError
  | HibpPwnedError
  | ZxcvbnScoreError;

export interface PasswordValidationResult {
  ok: boolean;
  errors: PolicyError[];
}

export interface PasswordUserContext {
  username?: string | null;
  email?: string | null;
}
