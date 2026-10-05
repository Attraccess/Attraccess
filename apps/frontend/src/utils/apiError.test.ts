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
    ['English', API_ERROR_TRANSLATIONS_EN, 'Meter not set up', 'METER_NOT_CONFIGURED: Heartbeats'],
    ['German', API_ERROR_TRANSLATIONS_DE, 'Zähler nicht eingerichtet', 'METER_NOT_CONFIGURED: Heartbeats'],
    [
      'English',
      API_ERROR_TRANSLATIONS_EN,
      'Meter not set up',
      'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats',
    ],
    [
      'German',
      API_ERROR_TRANSLATIONS_DE,
      'Zähler nicht eingerichtet',
      'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats',
    ],
  ])('uses localized setup guidance in %s (case %#)', (_locale, translations, expectedTitle, message) => {
    const result = getTranslationKeyForApiError({
      error: { body: { message } } as unknown as Error,
      t: (key: string) => key,
      tExists: (key: string) => getTranslation({ api: translations }, key) !== undefined,
      baseTranslationKey: 'api',
    });

    expect(result.key).toBe('api.METER_NOT_CONFIGURED');
    expect(result.errorMessage).toBe('Heartbeats');
    expect(getTranslation(translations, 'METER_NOT_CONFIGURED.title')).toBe(expectedTitle);
  });

  it.each([
    ['METER_SETTLEMENT_FAILED: meter offline', 'api.METER_SETTLEMENT_FAILED', 'meter offline'],
    ['METER_INITIALIZATION_FAILED: meter offline', 'api.METER_INITIALIZATION_FAILED', 'meter offline'],
    [
      'METER_INITIALIZATION_FAILED: FLOW_EXECUTION_ERROR: device offline',
      'api.METER_INITIALIZATION_FAILED',
      'FLOW_EXECUTION_ERROR: device offline',
    ],
    [
      'METER_INITIALIZATION_FAILED: METER_NOT_CONFIGURED: Heartbeats: METER_INITIALIZATION_FAILED: counter',
      'api.METER_NOT_CONFIGURED',
      'Heartbeats: METER_INITIALIZATION_FAILED: counter',
    ],
  ])('preserves the reason for %s', (message, key, errorMessage) => {
    const result = getTranslationKeyForApiError({
      error: { body: { message } } as unknown as Error,
      t: (key: string) => key,
      tExists: () => true,
      baseTranslationKey: 'api',
    });

    expect(result.key).toBe(key);
    expect(result.errorMessage).toBe(errorMessage);
  });
});
