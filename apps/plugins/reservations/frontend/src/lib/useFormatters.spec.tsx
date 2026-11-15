import { act, cleanup, renderHook } from '@testing-library/react';
import { useDateTimePreferences, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { afterEach, describe, expect, it } from 'vitest';
import { useFormatters } from './useFormatters';

const ZONE = 'Europe/Berlin';
const START = new Date('2026-06-01T15:30:00Z');
const END = new Date('2026-06-01T17:00:00Z');

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: null, userId: null });
});

describe('useFormatters', () => {
  it('follows the UI language while the user keeps the language default, like core', () => {
    const { result } = renderHook(() => useFormatters(ZONE));
    expect(result.current.time(START)).toBe('05:30 PM');
    act(() => useTranslationState.getState().setLanguage('de'));
    expect(result.current.time(START)).toBe('17:30');
    expect(result.current.range(START, END)).toBe('01.06.2026, 17:30 – 19:00');
  });

  it('uses the date/time locale the user picked for every time it shows', () => {
    useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' });
    const { result } = renderHook(() => useFormatters(ZONE));
    expect(result.current.locale).toBe('en-GB');
    expect(result.current.time(START)).toBe('17:30');
    expect(result.current.range(START, END)).toBe('01/06/2026, 17:30 – 19:00');
    expect(result.current.dateTime(START)).toBe('01/06/2026, 17:30');
    act(() => useDateTimePreferences.setState({ dateTimeLocale: 'en-US' }));
    expect(result.current.time(START)).toBe('05:30 PM');
  });

  it('keeps durations in the UI language when the date/time locale differs', () => {
    useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' });
    act(() => useTranslationState.getState().setLanguage('de'));
    const { result } = renderHook(() => useFormatters(ZONE));
    expect(result.current.duration(90)).toBe('1 Std. 30 Min.');
  });
});
