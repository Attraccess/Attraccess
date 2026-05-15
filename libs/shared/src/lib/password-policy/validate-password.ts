import {
  PasswordPolicyConfig,
  PasswordUserContext,
  PasswordValidationResult,
  PolicyError,
} from './types';
import { COMMON_PASSWORDS } from './common-passwords';

const UPPER_RE = /\p{Lu}/u;
const LOWER_RE = /\p{Ll}/u;
const DIGIT_RE = /\p{Nd}/u;
const SPECIAL_RE = /[^\p{L}\p{N}]/u;
const ASCII_PRINTABLE_RE = /^[\x20-\x7E]*$/;
const SIMILARITY_MIN_TOKEN_LENGTH = 4;

const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();

const containsToken = (haystack: string, needle: string): boolean => {
  if (needle.length < SIMILARITY_MIN_TOKEN_LENGTH) {
    return false;
  }
  return haystack.includes(needle);
};

const tokenizeIdentifier = (identifier: string): string[] => {
  return identifier
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= SIMILARITY_MIN_TOKEN_LENGTH);
};

export const validatePassword = (
  password: string,
  policy: PasswordPolicyConfig,
  userCtx: PasswordUserContext = {},
): PasswordValidationResult => {
  const errors: PolicyError[] = [];
  const pw = password ?? '';

  if (pw.length < policy.minLength) {
    errors.push({
      code: 'MIN_LENGTH',
      params: { min: policy.minLength, actual: pw.length },
    });
  }

  if (pw.length > policy.maxLength) {
    errors.push({
      code: 'MAX_LENGTH',
      params: { max: policy.maxLength, actual: pw.length },
    });
  }

  if (!policy.allowAllUnicode && !ASCII_PRINTABLE_RE.test(pw)) {
    errors.push({ code: 'DISALLOWED_CHARACTER', params: {} });
  }

  if (policy.requireUppercase && !UPPER_RE.test(pw)) {
    errors.push({ code: 'MISSING_UPPER', params: {} });
  }

  if (policy.requireLowercase && !LOWER_RE.test(pw)) {
    errors.push({ code: 'MISSING_LOWER', params: {} });
  }

  if (policy.requireDigit && !DIGIT_RE.test(pw)) {
    errors.push({ code: 'MISSING_DIGIT', params: {} });
  }

  if (policy.requireSpecial && !SPECIAL_RE.test(pw)) {
    errors.push({ code: 'MISSING_SPECIAL', params: {} });
  }

  const normalizedPw = normalize(pw);

  if (userCtx.username) {
    const normalizedUsername = normalize(userCtx.username);
    if (
      normalizedUsername.length >= SIMILARITY_MIN_TOKEN_LENGTH &&
      (containsToken(normalizedPw, normalizedUsername) || containsToken(normalizedUsername, normalizedPw))
    ) {
      errors.push({ code: 'SIMILAR_TO_USERNAME', params: {} });
    }
  }

  if (policy.checkCommonPasswords && COMMON_PASSWORDS.has(normalizedPw)) {
    errors.push({ code: 'COMMON_PASSWORD', params: {} });
  }

  if (userCtx.email) {
    const normalizedEmail = normalize(userCtx.email);
    const localPart = normalizedEmail.split('@')[0] ?? normalizedEmail;
    const emailTokens = new Set<string>([
      ...tokenizeIdentifier(localPart),
      ...tokenizeIdentifier(normalizedEmail),
    ]);
    for (const token of emailTokens) {
      if (containsToken(normalizedPw, token)) {
        errors.push({ code: 'SIMILAR_TO_EMAIL', params: {} });
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
};
