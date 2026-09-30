import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTranslations, useTranslationState } from './i18n';

beforeEach(() => {
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
  useTranslationState.setState({ language: 'en' });
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
