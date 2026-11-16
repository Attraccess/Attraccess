import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDateTimePreferences, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { Duration, MISSING_VALUE, scaleBytes, useRabbitmqFormatters } from './format';

afterEach(() => {
  cleanup();
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: null, userId: null });
});

describe('locale-aware formatting', () => {
  it('formats numbers, bytes and rates in the UI language', () => {
    const { result } = renderHook(() => useRabbitmqFormatters());
    expect(result.current.number(20480)).toBe('20,480');
    expect(result.current.bytes(1536)).toBe('1.5 KiB');
    expect(result.current.bytes(512)).toBe('512 B');
    expect(result.current.rate(1.5, 'B/s')).toBe('1.5 B/s');

    act(() => useTranslationState.setState({ language: 'de' }));
    expect(result.current.number(20480)).toBe('20.480');
    expect(result.current.bytes(1536)).toBe('1,5 KiB');
    expect(result.current.bytes(3 * 1024 ** 3)).toBe('3,0 GiB');
    expect(result.current.rate(2, '/s')).toBe('2,0 /s');
  });

  it('formats timestamps with the date/time locale preference over the UI language', () => {
    const at = Date.UTC(2026, 10, 8, 12, 0, 0);
    const { result } = renderHook(() => useRabbitmqFormatters());
    const dateOptions: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    expect(result.current.dateTime(at)).toBe(new Intl.DateTimeFormat('en', dateOptions).format(at));

    act(() => useDateTimePreferences.setState({ dateTimeLocale: 'de-DE' }));
    expect(result.current.dateTime(at)).toBe(new Intl.DateTimeFormat('de-DE', dateOptions).format(at));
    expect(result.current.time(at)).toBe(
      new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(at),
    );
  });

  it('renders one dash for every missing value', () => {
    const { result } = renderHook(() => useRabbitmqFormatters());
    for (const value of [
      result.current.number(null),
      result.current.bytes(null),
      result.current.rate(null, '/s'),
      result.current.dateTime(null),
      result.current.time(null),
    ])
      expect(value).toBe(MISSING_VALUE);
    expect(render(<Duration ms={null} />).container.textContent).toBe(MISSING_VALUE);
  });

  it('formats node uptime as a localized duration in whole minutes', () => {
    const { container } = render(<Duration ms={90_000_000 + 59_000} />);
    expect(container.textContent).toBe('1d 1h 0m');
    act(() => useTranslationState.setState({ language: 'de' }));
    expect(container.textContent).toBe('1 T, 1h und 0 Min.');
  });

  it('scales bytes to binary units', () => {
    expect(scaleBytes(1023)).toEqual({ value: 1023, unit: 'B' });
    expect(scaleBytes(1024 ** 2)).toEqual({ value: 1, unit: 'MiB' });
    expect(scaleBytes(1024 ** 6)).toEqual({ value: 1024 ** 2, unit: 'TiB' });
  });
});
