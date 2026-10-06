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
it.each([
  [0, '00:00:00'],
  [1.0459662973880768, '00:01:03'],
  [0.14946676790714264, '00:00:09'],
  [0.1195661723613739, '00:00:07'],
  [59.49 / 60, '00:00:59'],
  [59.5 / 60, '00:01:00'],
  [59 + 59.5 / 60, '01:00:00'],
  [24 * 60, '24:00:00'],
  [2432.099783420562744, '40:32:06'],
  [100 * 60, '100:00:00'],
])('formats %s minutes as %s', (minutes, expected) => {
  const { result } = renderHook(() => useFormatedDuration(minutes));
  expect(result.current).toBe(expected);
});
it('formats durations consistently across languages without native duration formatting', () => {
  vi.stubGlobal('Intl', { ...Intl, DurationFormat: undefined });
  const { result, rerender } = renderHook(({ minutes }) => useFormatedDuration(minutes), {
    initialProps: { minutes: 1505.4 },
  });
  expect(result.current).toBe('25:05:24');
  act(() => useTranslationState.getState().setLanguage('de'));
  expect(result.current).toBe('25:05:24');
  rerender({ minutes: 1.0459662973880768 });
  expect(result.current).toBe('00:01:03');
});
