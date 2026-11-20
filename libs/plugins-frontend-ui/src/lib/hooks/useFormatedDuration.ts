import { useCallback, useMemo } from 'react';
import { useTranslationState } from '../i18n';

/**
 * A hook for formatting duration values using the Intl.DurationFormat API (if supported)
 * and respecting the current language settings, rounded to the nearest second.
 *
 * @returns A localized duration string without subsecond precision
 */
export function useFormatedDuration(minutes: number) {
  const { language } = useTranslationState();

  const formatDuration = useCallback(
    (minutes: number) => {
      // Round before splitting so seconds carry into minutes, hours, and days.
      const totalSeconds = Math.round(minutes * 60);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const remainingMinutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      try {
        // Check if Intl.DurationFormat is supported
        // @ts-expect-error - DurationFormat is a new API not yet in TypeScript definitions
        if (typeof Intl.DurationFormat === 'function') {
          // @ts-expect-error - DurationFormat is a new API not yet in TypeScript definitions
          const formatter = new Intl.DurationFormat(language, {
            style: 'narrow',
            minutesDisplay: 'always',
          });

          return formatter.format({
            days,
            hours,
            minutes: remainingMinutes,
            seconds,
          });
        }

        // Fallback if not supported
        throw new Error('Intl.DurationFormat not supported');
      } catch {
        // Keep localized unit labels and separators even without DurationFormat.
        const parts = [
          { unit: 'day', value: days },
          { unit: 'hour', value: hours },
          { unit: 'minute', value: remainingMinutes },
          { unit: 'second', value: seconds },
        ]
          .filter(({ unit, value }) => unit === 'minute' || value > 0)
          .map(({ unit, value }) =>
            new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value),
          );
        return new Intl.ListFormat(language, { style: 'narrow', type: 'unit' }).format(parts);
      }
    },
    [language],
  );

  const formattedDuration = useMemo(() => formatDuration(minutes), [minutes, formatDuration]);

  return formattedDuration;
}
