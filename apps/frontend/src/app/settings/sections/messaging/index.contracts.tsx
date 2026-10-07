import { MessagingRateLimitSettingsDto } from '@attraccess/react-query-client';
export type ConfirmStep = 'warning' | 'final' | null;

export type LimitKey = keyof MessagingRateLimitSettingsDto;
