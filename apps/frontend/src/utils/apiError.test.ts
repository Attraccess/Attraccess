import { describe, expect, it, vi } from 'vitest';
import { getTranslationKeyForApiError } from './apiError';
import API_ERROR_TRANSLATIONS_EN from '../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../global-translations/api-errors.de.json';

function getTranslation(translations: Record<string, unknown>, key: string) {
  return key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], translations);
}

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

  it.each([
    ['English', API_ERROR_TRANSLATIONS_EN, 'Invalid CSV file'],
    ['German', API_ERROR_TRANSLATIONS_DE, 'Ungültige CSV-Datei'],
  ])('uses a localized INVALID_CSV error message in %s', (_locale, translations, expectedTitle) => {
    const result = getTranslationKeyForApiError({
      error: { body: { message: 'INVALID_CSV' } } as unknown as Error,
      t: (key: string) => key,
      tExists: (key: string) => getTranslation({ api: translations }, key) !== undefined,
      baseTranslationKey: 'api',
    });

    expect(result.key).toBe('api.INVALID_CSV');
    expect(getTranslation(translations, 'INVALID_CSV.title')).toBe(expectedTitle);
    expect(getTranslation(translations, 'INVALID_CSV.description')).not.toBe('INVALID_CSV');
  });

  it.each([
    ['English', API_ERROR_TRANSLATIONS_EN, 'Meter not set up'],
    ['German', API_ERROR_TRANSLATIONS_DE, 'Zähler nicht eingerichtet'],
  ])('uses localized setup guidance for a named incomplete meter in %s', (_locale, translations, expectedTitle) => {
    const result = getTranslationKeyForApiError({
      error: { body: { message: 'METER_NOT_CONFIGURED: Heartbeats' } } as unknown as Error,
      t: (key: string) => key,
      tExists: (key: string) => getTranslation({ api: translations }, key) !== undefined,
      baseTranslationKey: 'api',
    });

    expect(result.key).toBe('api.METER_NOT_CONFIGURED');
    expect(result.errorMessage).toBe('Heartbeats');
    expect(getTranslation(translations, 'METER_NOT_CONFIGURED.title')).toBe(expectedTitle);
  });

  it('splits the reason off a prefixed meter error', () => {
    const result = getTranslationKeyForApiError({
      error: { body: { message: 'METER_SETTLEMENT_FAILED: meter offline' } } as unknown as Error,
      t: (key: string) => key,
      tExists: () => true,
      baseTranslationKey: 'api',
    });

    expect(result.key).toBe('api.METER_SETTLEMENT_FAILED');
    expect(result.errorMessage).toBe('meter offline');
  });
});
