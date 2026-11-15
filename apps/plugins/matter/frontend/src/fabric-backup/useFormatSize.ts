import { useNumberFormatter } from '@attraccess/plugins-frontend-ui';
import { useCallback } from 'react';

const ONE_DECIMAL: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const KIB = 1024;
const MIB = KIB * KIB;

/** A byte count in B, KiB or MiB, with the number formatted for the current language. */
export function useFormatSize() {
  const formatInteger = useNumberFormatter();
  const formatDecimal = useNumberFormatter(ONE_DECIMAL);
  return useCallback(
    (bytes: number) => {
      if (bytes < KIB) return `${formatInteger(bytes)} B`;
      if (bytes < MIB) return `${formatDecimal(bytes / KIB)} KiB`;
      return `${formatDecimal(bytes / MIB)} MiB`;
    },
    [formatInteger, formatDecimal],
  );
}
