import { describe, expect, it, vi } from 'vitest';
import { getTranslationKeyForApiError } from './apiError';

describe('getTranslationKeyForApiError', () => {
  it('returns the inactive email translation key when available', () => {
    const tExists = vi.fn().mockReturnValue(true);
    const error = {
      body: {
        message: 'UserEmailNotVerifiedException',
      },
    };

    const result = getTranslationKeyForApiError({
      error: error as unknown as Error,
      t: (key: string) => key,
      tExists,
      baseTranslationKey: 'api',
      fallbackKey: 'generic',
    });

    expect(result.key).toBe('api.UserEmailNotVerifiedException');
    expect(result.errorMessage).toBe('UserEmailNotVerifiedException');
  });
});
