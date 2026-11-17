import { AuthRateLimitSettingsDto } from '@attraccess/react-query-client';

export type RateLimitKey = 'maxAttempts' | 'windowSeconds' | 'lockoutDurationSeconds' | 'backoffMultiplier';

export const RATE_LIMIT_NUMBERS: RateLimitKey[] = ['maxAttempts', 'windowSeconds', 'lockoutDurationSeconds'];

export function getRateLimitDraft(
  saved: AuthRateLimitSettingsDto | undefined,
  draft: Partial<AuthRateLimitSettingsDto>,
) {
  const rateValue = (key: RateLimitKey): number => draft[key] ?? saved?.[key] ?? NaN;
  const exponentialBackoff = draft.exponentialBackoff ?? saved?.exponentialBackoff ?? false;
  const isRateDirty =
    !!saved &&
    (RATE_LIMIT_NUMBERS.some((key) => !Object.is(rateValue(key), saved[key])) ||
      !Object.is(rateValue('backoffMultiplier'), saved.backoffMultiplier) ||
      exponentialBackoff !== saved.exponentialBackoff);
  // Clearing a NumberField yields NaN. That is still a departure from the saved value, so the bar
  // stays mounted and Discard stays reachable — only Save is blocked.
  //
  // Integer, not merely finite: the three throttling counters and every policy number are `@IsInt()`
  // on the API, and none of these steppers sets a `step`, so `2.5` is typeable. `Number.isFinite`
  // let it through to a 400 rendered as a generic toast that names no field.
  // `backoffMultiplier` is the one genuine `@IsNumber()`, so it only has to be finite and >= 1.
  const isRateSavable =
    RATE_LIMIT_NUMBERS.every((key) => Number.isInteger(rateValue(key)) && rateValue(key) >= 1) &&
    Number.isFinite(rateValue('backoffMultiplier')) &&
    rateValue('backoffMultiplier') >= 1;
  return { value: rateValue, exponentialBackoff, isDirty: isRateDirty, isSavable: isRateSavable };
}
