import { useMemo, useCallback } from 'react';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';

/** Preserve arbitrary counter precision rather than coercing decimal strings to Number. */
export function useMeterValueFormatter() {
  const { language } = useTranslationState();
  const formatter = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 0 }), [language]);
  const separator = language === 'de' ? ',' : '.';
  return useCallback(
    (value: string) => {
      const [whole, fraction] = value.split('.');
      const integer = formatter.format(BigInt(whole));
      return fraction ? `${integer}${separator}${fraction}` : integer;
    },
    [formatter, separator],
  );
}
