import { useCallback, useMemo } from 'react';
import { useDateTimeLocale } from './dateTimePreferences';

export interface DateTimeOptions {
  showTime?: boolean;
  showDate?: boolean;
  showSeconds?: boolean;
  dateTimeLocale?: string | null;
}

export function useDateTimeFormatter(options?: DateTimeOptions) {
  const { showTime = true, showDate = true, showSeconds = false } = options ?? {};
  const locale = useDateTimeLocale(options?.dateTimeLocale);

  const formatter = useMemo(() => {
    const formatOptions: Intl.DateTimeFormatOptions = {};

    if (showTime) {
      formatOptions.hour = '2-digit';
      formatOptions.minute = '2-digit';

      if (showSeconds) {
        formatOptions.second = '2-digit';
      }
    }

    if (showDate) {
      formatOptions.day = '2-digit';
      formatOptions.month = '2-digit';
      formatOptions.year = 'numeric';
    }

    const intlFormatter = new Intl.DateTimeFormat(locale, formatOptions);
    return (date: Date) => (!showDate && !showTime ? '' : intlFormatter.format(date));
  }, [showDate, showTime, showSeconds, locale]);

  return useCallback(
    (date?: Date | string | number | null, fallback?: string | React.ReactNode) => {
      if (date === null || date === undefined) {
        return fallback ?? '-';
      }

      const dateAsDate = new Date(date);
      if (isNaN(dateAsDate.getTime())) {
        return fallback ?? '-';
      }

      return formatter(dateAsDate);
    },
    [formatter],
  );
}

export function useFormatDateTime(date?: Date | string | number | null, options?: DateTimeOptions) {
  const formatter = useDateTimeFormatter(options);

  return formatter(date);
}
