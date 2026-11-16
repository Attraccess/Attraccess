import { useMemo } from 'react';
import { useDateTimeLocale } from '@attraccess/plugins-frontend-ui';
import { useReservationsTranslations } from '../i18n';
import { browserTimeZone, formatDate, formatDateTime, formatDuration, formatTime } from './time';

/**
 * Date/time formatting in the plugin timezone (falls back to the browser's). Dates and times follow the user's
 * date/time locale preference, like core; durations follow the UI language.
 */
export function useFormatters(timezone?: string | null) {
  const { language } = useReservationsTranslations();
  const locale = useDateTimeLocale();
  return useMemo(() => {
    const zone = timezone || browserTimeZone();
    return {
      zone,
      locale,
      time: (value: string | Date) => formatTime(value, zone, locale),
      date: (value: string | Date) => formatDate(value, zone, locale),
      dateTime: (value: string | Date) => formatDateTime(value, zone, locale),
      duration: (minutes: number) => formatDuration(minutes, language),
      range: (start: string | Date, end: string | Date) =>
        `${formatDateTime(start, zone, locale)} – ${formatTime(end, zone, locale)}`,
    };
  }, [timezone, locale, language]);
}
