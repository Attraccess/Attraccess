import { AuthRateLimitSettingsDto } from '@attraccess/react-query-client';
export type RateLimitKey = keyof Pick<
  AuthRateLimitSettingsDto,
  'maxAttempts' | 'windowSeconds' | 'lockoutDurationSeconds' | 'backoffMultiplier'
>;
