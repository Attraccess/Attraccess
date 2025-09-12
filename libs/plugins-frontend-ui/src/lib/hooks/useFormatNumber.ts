import { useCallback, useMemo } from 'react';
import { useTranslationState } from '../i18n';

export function useNumberFormatter(options?: Intl.NumberFormatOptions) {
  const { language } = useTranslationState();

  const formatter = useMemo(() => {
    return new Intl.NumberFormat(language, options);
  }, [language, options]);

  return useCallback(
    (num?: string | number | null) => {
      if (num === null || num === undefined) {
        return '-';
      }

      const numAsNumber = Number(num);
      if (isNaN(numAsNumber)) {
        return '-';
      }

      return formatter.format(numAsNumber);
    },
    [formatter],
  );
}

export function useFormatNumber(num?: string | number | null) {
  const formatter = useNumberFormatter();

  return formatter(num);
}
