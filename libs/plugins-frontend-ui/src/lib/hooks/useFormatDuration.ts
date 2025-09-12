import { useCallback, useMemo } from 'react';
import { useTranslationState } from '../i18n';

/**
 * A hook for formatting duration values using the Intl.DurationFormat API (if supported)
 * and respecting the current language settings.
 *
 * @returns A function that formats minutes into a localized duration string
 */
export function useFormatedDuration(minutes: number) {
  const { language } = useTranslationState();

  const formatDuration = useCallback(
    (minutes: number) => {
      const minutesInAHour = 60;
      const minutesInADay = minutesInAHour * 24;
      const days = Math.floor(minutes / minutesInADay);
      const hours = Math.floor((minutes - days * minutesInADay) / minutesInAHour);
      const remainingMinutes = minutes - days * minutesInADay - hours * minutesInAHour;

      try {
        // Check if Intl.DurationFormat is supported
        // @ts-expect-error - DurationFormat is a new API not yet in TypeScript definitions
        if (typeof Intl.DurationFormat === 'function') {
          const fields = [];
          if (days > 0) {
            fields.push('days');
          }

          fields.push('hours');
          fields.push('minutes');

          // @ts-expect-error - DurationFormat is a new API not yet in TypeScript definitions
          const formatter = new Intl.DurationFormat(language, {
            style: 'narrow',
            fields,
            minutesDisplay: 'always',
          });

          return formatter.format({
            days,
            hours,
            minutes: Math.round(remainingMinutes),
          });
        }

        // Fallback if not supported
        throw new Error('Intl.DurationFormat not supported');
      } catch (error) {
        console.warn('Intl.DurationFormat not supported', error);

        // Fallback for browsers that don't support Intl.DurationFormat
        if (language.startsWith('de')) {
          return `${days}T ${hours}Std. ${remainingMinutes}Min.`;
        }
        return `${days}T ${hours}h ${remainingMinutes}m`;
      }
    },
    [language],
  );

  const formattedDuration = useMemo(() => formatDuration(minutes), [minutes, formatDuration]);

  return formattedDuration;
}
