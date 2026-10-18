import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  detectAndSetLanguage,
  detectLanguage,
  detectPreferredLanguage,
  useTranslations,
  useTranslationState,
} from './i18n';

beforeEach(() => {
  useTranslationState.setState({ language: 'en', explicitLanguage: undefined });
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  useTranslationState.setState({ language: 'en', explicitLanguage: undefined });
});
it('reports missing nested translation leaves without treating plural objects or arrays as branches', () => {
  vi.stubEnv('NODE_ENV', 'development');
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  renderHook(() =>
    useTranslations({
      en: { nested: { label: 'Only English' }, list: ['one'], nullable: null, count: { one: 'one', many: 'many' } },
      de: { count: { one: 'eins', many: 'viele' } },
    }),
  );
  expect(error).toHaveBeenCalledWith('Missing i18n Translation Key:', 'nested.label', 'in languages:', ['de']);
  expect(error).toHaveBeenCalledWith('Missing i18n Translation Key:', 'list', 'in languages:', ['de']);
  expect(error).toHaveBeenCalledWith('Missing i18n Translation Key:', 'nullable', 'in languages:', ['de']);
  expect(error).toHaveBeenCalledTimes(3);
});
it('switches language, falls back to English, and resolves plural values', async () => {
  const { result } = renderHook(() =>
    useTranslations({
      en: { greeting: 'Hello {{name}}', count: { one: 'One', many: '{{count}} items' } },
      de: { greeting: 'Hallo {{name}}' },
    }),
  );
  expect(result.current.t('greeting', { name: "Maker's" })).toBe("Hello Maker's");
  await act(async () => result.current.setLanguage('de'));
  expect(result.current.language).toBe('de');
  expect(result.current.t('greeting', { name: 'Maker' })).toBe('Hallo Maker');
  expect(result.current.t('count', { count: 2 })).toBe('2 items');
  expect(result.current.t('count', { count: 1 })).toBe('One');
  expect(result.current.tExists('count')).toBe(true);
  expect(localStorage.getItem('language')).toBe('de');
});

it('uses English for an unsupported detected locale so host and plugins can still translate', () => {
  vi.stubGlobal('navigator', { language: 'fr-FR' });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  detectAndSetLanguage();
  const { result } = renderHook(() => useTranslations({ en: { title: 'Devices' }, de: { title: 'Geräte' } }));
  expect(result.current.language).toBe('en');
  expect(result.current.t('title')).toBe('Devices');
});

it('preserves names in React text and retranslates retained message descriptors', () => {
  const message = { key: 'saved', data: { name: 'R&D <Workshop>' } };
  const { result } = renderHook(() =>
    useTranslations(
      {
        en: { saved: 'Saved {{name}}' },
        de: { saved: '{{name}} gespeichert' },
      },
      { escapeValues: false },
    ),
  );
  expect(result.current.tMessage(message)).toBe('Saved R&D <Workshop>');
  act(() => result.current.setLanguage('de'));
  expect(result.current.tMessage(message)).toBe('R&D <Workshop> gespeichert');
  expect(result.current.tMessage('Literal server error')).toBe('Literal server error');
});

it('does not persist detected fallbacks, and honors supported browser and stored choices', () => {
  vi.stubGlobal('navigator', { language: 'fr', languages: ['fr'] });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  detectAndSetLanguage();
  expect(localStorage.getItem('language')).toBeNull();
  expect(detectLanguage('de')).toBe('de');
  vi.stubGlobal('navigator', { language: 'fr', languages: ['fr', 'en-GB'] });
  expect(detectLanguage('de')).toBe('en');
  localStorage.setItem('language', 'de');
  expect(detectLanguage('en')).toBe('de');
});

it('retains an explicit choice in memory when both browser stores are inaccessible', () => {
  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  const blocked = {
    getItem: () => {
      throw new Error('Storage unavailable');
    },
    setItem: () => {
      throw new Error('Storage unavailable');
    },
  };
  vi.stubGlobal('localStorage', blocked);
  vi.stubGlobal('sessionStorage', blocked);
  useTranslationState.getState().setLanguage('de');
  expect(detectLanguage('en')).toBe('de');
});

it.each(['getter', 'getItem'] as const)('uses the session language when the local storage %s throws', (failure) => {
  vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
  vi.stubGlobal('sessionStorage', { getItem: () => 'de' });
  const unavailable = () => {
    throw new Error('Storage unavailable');
  };
  if (failure === 'getter') vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(unavailable);
  else vi.stubGlobal('localStorage', { getItem: unavailable });

  expect(detectPreferredLanguage()).toBe('de');
  expect(detectLanguage('en')).toBe('de');
  detectAndSetLanguage();
  expect(useTranslationState.getState().language).toBe('de');
  expect(useTranslationState.getState().explicitLanguage).toBeUndefined();
});

it('keeps memory and local choices ahead of the session language', () => {
  vi.stubGlobal('sessionStorage', { getItem: () => 'de' });
  localStorage.setItem('language', 'en');
  expect(detectPreferredLanguage()).toBe('en');
  useTranslationState.setState({ explicitLanguage: 'de' });
  expect(detectPreferredLanguage()).toBe('de');
});
