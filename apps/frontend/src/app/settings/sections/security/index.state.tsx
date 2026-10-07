import { PasswordPolicyRole } from '@attraccess/react-query-client';
import type { RateLimitKey } from './index.rate-limit-key';
import { TwoFactorPolicy } from '@attraccess/react-query-client';

export const OVERRIDE_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

export const RATE_LIMIT_NUMBERS: RateLimitKey[] = ['maxAttempts', 'windowSeconds', 'lockoutDurationSeconds'];

export const TWO_FACTOR_OPTIONS = [
  { value: TwoFactorPolicy.OPTIONAL, key: 'optional' },
  { value: TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED, key: 'privileged' },
  { value: TwoFactorPolicy.REQUIRED_FOR_ALL, key: 'all' },
];
