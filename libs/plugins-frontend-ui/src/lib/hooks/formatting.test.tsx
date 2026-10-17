import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDateTimeFormatter } from './useFormatDateTime';
import { useFormatedDuration } from './useFormatDuration';
import { useDateTimePreferences } from './dateTimePreferences';
import { useTranslationState } from '../i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: null, userId: null });
});
it('formats dates with selected fields and preserves fallbacks for missing or invalid input', () => {
  const date = new Date('2026-01-02T12:34:56Z');
  const { result } = renderHook(() => useDateTimeFormatter({ showDate: false, showTime: true, showSeconds: true }));
  expect(result.current(date)).toBe(
    new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date),
  );
  expect(result.current(null)).toBe('-');
  expect(result.current(undefined, 'missing')).toBe('missing');
  expect(result.current('not a date', 'invalid')).toBe('invalid');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current(date.getTime())).toBe(
    new Intl.DateTimeFormat('de', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date),
  );
});
it('uses localized duration fallbacks when native formatting is unavailable', () => {
  vi.stubGlobal('Intl', Object.create(Intl, { DurationFormat: { value: undefined } }));
  const { result } = renderHook(() => useFormatedDuration(1505.4));
  expect(result.current).toBe('1d 1h 5m 24s');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current).toBe('1 T, 1h, 5 Min. und 24 Sek.');
});
it('passes normalized duration parts to native formatting', () => {
  const format = vi.fn(() => 'native duration');
  class DurationFormat {
    format = format;
  }
  vi.stubGlobal('Intl', Object.create(Intl, { DurationFormat: { value: DurationFormat } }));
  const { result } = renderHook(() => useFormatedDuration(1505.4));
  expect(result.current).toBe('native duration');
  expect(format).toHaveBeenCalledWith({ days: 1, hours: 1, minutes: 5, seconds: 24 });
});
it.each([
  [0, '0m'],
  [70.123 / 60, '1m 10s'],
  [1.0459662973880768, '1m 3s'],
  [0.14946676790714264, '0m 9s'],
  [0.1195661723613739, '0m 7s'],
  [59.49 / 60, '0m 59s'],
  [59.5 / 60, '1m'],
  [59 + 59.5 / 60, '1h 0m'],
  [24 * 60 - 0.5 / 60, '1d 0m'],
  [2432.099783420562744, '1d 16h 32m 6s'],
  [100 * 60, '4d 4h 0m'],
])('rounds %s minutes to localized whole seconds with and without native Intl.DurationFormat', (minutes, expected) => {
  const native = renderHook(() => useFormatedDuration(minutes));
  expect(native.result.current).toBe(expected);
  native.unmount();

  vi.stubGlobal('Intl', Object.create(Intl, { DurationFormat: { value: undefined } }));
  const fallback = renderHook(() => useFormatedDuration(minutes));
  expect(fallback.result.current).toBe(expected);
});
it('updates native duration formatting when the language or duration changes', () => {
  const { result, rerender } = renderHook(({ minutes }) => useFormatedDuration(minutes), {
    initialProps: { minutes: 70.123 / 60 },
  });
  expect(result.current).toBe('1m 10s');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current).toBe('1 Min., 10 Sek.');
  rerender({ minutes: 2.5 });
  expect(result.current).toBe('2 Min., 30 Sek.');
});
it('uses the localized fallback if native duration formatting throws', () => {
  class DurationFormat {
    format() {
      throw new RangeError('Native duration formatting failed');
    }
  }
  vi.stubGlobal('Intl', Object.create(Intl, { DurationFormat: { value: DurationFormat } }));
  const { result } = renderHook(() => useFormatedDuration(70.123 / 60));
  expect(result.current).toBe('1m 10s');
});

const fields = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
} as const;
it.each(['en-GB', 'en-US', 'de-DE', 'ja-JP', 'th-TH-u-ca-buddhist'])(
  'uses native Intl for %s and retains custom locale across language changes',
  (locale) => {
    const date = new Date(2026, 10, 23, 17, 45, 30);
    useDateTimePreferences.setState({ dateTimeLocale: locale });
    const { result } = renderHook(() => useDateTimeFormatter({ showSeconds: true }));
    expect(result.current(date)).toBe(new Intl.DateTimeFormat(locale, fields).format(date));
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current(date)).toBe(new Intl.DateTimeFormat(locale, fields).format(date));
  },
);

it('updates shared consumers, isolates previews, and respects an explicit null override', () => {
  const date = new Date(2026, 10, 23, 17, 45, 30);
  useDateTimePreferences.setState({ dateTimeLocale: 'en-US' });
  const saved = renderHook(() => useDateTimeFormatter({ showSeconds: true }));
  const plugin = renderHook(() => useDateTimeFormatter({ showSeconds: true }));
  const preview = renderHook(() => useDateTimeFormatter({ dateTimeLocale: null, showSeconds: true }));
  const customPreview = renderHook(() => useDateTimeFormatter({ dateTimeLocale: 'ja-JP', showSeconds: true }));
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(preview.result.current(date)).toBe(new Intl.DateTimeFormat('de', fields).format(date));
  expect(customPreview.result.current(date)).toBe(new Intl.DateTimeFormat('ja-JP', fields).format(date));
  expect(saved.result.current(date)).toBe(new Intl.DateTimeFormat('en-US', fields).format(date));
  act(() => useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' }));
  expect(saved.result.current(date)).toBe(new Intl.DateTimeFormat('en-GB', fields).format(date));
  expect(plugin.result.current(date)).toBe(saved.result.current(date));
});

it('falls back safely for bad persisted locales and preserves time-only and empty options', () => {
  useDateTimePreferences.setState({ dateTimeLocale: 'en_US' });
  const date = new Date(2026, 10, 23, 17, 45);
  const time = renderHook(() => useDateTimeFormatter({ showDate: false }));
  expect(time.result.current(date)).toBe(
    new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(date),
  );
  const empty = renderHook(() => useDateTimeFormatter({ showDate: false, showTime: false }));
  expect(empty.result.current(date)).toBe('');
});
