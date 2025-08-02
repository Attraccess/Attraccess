import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface DateTimeOptions {
  showTime?: boolean;
  showDate?: boolean;
  showSeconds?: boolean;
}

export function useDateTimeFormatter(options?: DateTimeOptions) {
  const { showTime = true, showDate = true, showSeconds = false } = options ?? {};
  const { i18n } = useTranslation();

  const formatter = useMemo(() => {
    const formatOptions: Intl.DateTimeFormatOptions = {};

    if (showTime) {
      formatOptions.hour12 = false;
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

    return new Intl.DateTimeFormat(i18n.language, formatOptions);
  }, [showDate, showTime, showSeconds, i18n.language]);

  return useCallback(
    (date?: Date | string | number | null, fallback?: string | React.ReactNode) => {
      if (date === null || date === undefined) {
        return fallback ?? '-';
      }

      const dateAsDate = new Date(date);
      if (isNaN(dateAsDate.getTime())) {
        return fallback ?? '-';
      }

      return formatter.format(dateAsDate);
    },
    [formatter]
  );
}

export function useFormatDateTime(date?: Date | string | number | null, options?: DateTimeOptions) {
  const formatter = useDateTimeFormatter(options);

  return formatter(date);
}
