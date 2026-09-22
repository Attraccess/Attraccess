import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDateTimeFormatter } from './useFormatDateTime';
import { useFormatedDuration } from './useFormatDuration';
import { useTranslationState } from '../i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useTranslationState.setState({ language: 'en' });
});
it('formats dates with selected fields and preserves fallbacks for missing or invalid input', () => {
  const date = new Date('2026-01-02T12:34:56Z');
  const { result } = renderHook(() => useDateTimeFormatter({ showDate: false, showTime: true, showSeconds: true }));
  expect(result.current(date)).toBe(
    new Intl.DateTimeFormat('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      date,
    ),
  );
  expect(result.current(null)).toBe('-');
  expect(result.current(undefined, 'missing')).toBe('missing');
  expect(result.current('not a date', 'invalid')).toBe('invalid');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current(date.getTime())).toBe(
    new Intl.DateTimeFormat('de', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      date,
    ),
  );
});
it('uses localized duration fallbacks when native formatting is unavailable', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('Intl', { ...Intl, DurationFormat: undefined });
  const { result } = renderHook(() => useFormatedDuration(1505));
  expect(result.current).toBe('1T 1h 5m');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current).toBe('1T 1Std. 5Min.');
});
it('passes normalized duration parts to native formatting', () => {
  const format = vi.fn(() => 'native duration');
  class DurationFormat {
    format = format;
  }
  vi.stubGlobal('Intl', { ...Intl, DurationFormat });
  const { result } = renderHook(() => useFormatedDuration(1505.4));
  expect(result.current).toBe('native duration');
  expect(format).toHaveBeenCalledWith({ days: 1, hours: 1, minutes: 5 });
});
