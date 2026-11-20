import { describe, expect, it } from 'vitest';
import { getRetryAfterSeconds } from './retryAfterSeconds';
import API_ERROR_TRANSLATIONS_EN from '../global-translations/api-errors.en.json';

describe('getRetryAfterSeconds', () => {
  it.each([
    [{ body: { message: 'TooManyAuthAttempts', retryAfterSeconds: 42 } }, 42],
    [{ body: { message: 'TooManyAuthAttempts', retryAfterSeconds: '17' } }, 17],
    [{ body: { message: 'x', retryAfterSeconds: 0 } }, ''],
    [{ body: { message: 'x', retryAfterSeconds: 'soon' } }, ''],
    [{ body: { message: 'x' } }, ''],
    [new Error('no body'), ''],
  ])('reads the wait from %j', (error, expected) => {
    expect(getRetryAfterSeconds(error as unknown as Error)).toBe(expected);
  });

  it('is shown in the shared rate-limit copy without naming sign-in', () => {
    expect(API_ERROR_TRANSLATIONS_EN.TooManyAuthAttempts.description).toContain(
      '{{retryAfterSeconds}}',
    );
    expect(JSON.stringify(API_ERROR_TRANSLATIONS_EN.TooManyAuthAttempts)).not.toMatch(/sign[- ]in/i);
  });
});
