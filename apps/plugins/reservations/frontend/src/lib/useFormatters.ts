import { useMemo } from 'react';
import { useReservationsTranslations } from '../i18n';
import { browserTimeZone, formatDate, formatDateTime, formatDuration, formatTime } from './time';

/** Date/time formatting in the plugin timezone (falls back to the browser's) and the UI language. */
export function useFormatters(timezone?: string | null) {
  const { language } = useReservationsTranslations();
  return useMemo(() => {
    const zone = timezone || browserTimeZone();
    return {
      zone,
      locale: language,
      time: (value: string | Date) => formatTime(value, zone, language),
      date: (value: string | Date) => formatDate(value, zone, language),
      dateTime: (value: string | Date) => formatDateTime(value, zone, language),
      duration: (minutes: number) => formatDuration(minutes, language),
      range: (start: string | Date, end: string | Date) =>
        `${formatDateTime(start, zone, language)} – ${formatTime(end, zone, language)}`,
    };
  }, [timezone, language]);
}
