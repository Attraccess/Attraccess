import { PasswordPolicyDto } from '@attraccess/react-query-client';

export interface PolicyNumberField {
  key: keyof PasswordPolicyDto;
  min: number;
  max: number;
}

export const POLICY_NUMBER_FIELDS: PolicyNumberField[] = [
  { key: 'minLength', min: 8, max: 1024 },
  { key: 'maxLength', min: 8, max: 1024 },
  { key: 'minZxcvbnScore', min: 0, max: 4 },
  { key: 'historySize', min: 0, max: 50 },
  { key: 'rotationDays', min: 0, max: 3650 },
];

export const POLICY_BOOL_FIELDS: Array<keyof PasswordPolicyDto> = [
  'allowAllUnicode',
  'requireUppercase',
  'requireLowercase',
  'requireDigit',
  'requireSpecial',
  'checkHIBP',
  'checkCommonPasswords',
];

export const POLICY_FIELD_KEYS: Array<keyof PasswordPolicyDto> = [
  ...POLICY_NUMBER_FIELDS.map((f) => f.key),
  ...POLICY_BOOL_FIELDS,
];
