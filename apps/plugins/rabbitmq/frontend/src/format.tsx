// Locale-aware formatting for the RabbitMQ panels. Numbers follow the UI
// language and dates/times the user's date/time locale preference, through the
// shared formatters; only the byte/rate unit scaling lives here.
import { useDateTimeFormatter, useFormatedDuration, useNumberFormatter } from '@attraccess/plugins-frontend-ui';
import { useCallback, useMemo } from 'react';

// The one placeholder every panel shows for a value the broker did not report.
export const MISSING_VALUE = '—';

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
const ONE_DECIMAL: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const TIME_ONLY = { showDate: false, showSeconds: true };

// Scales a byte count to the largest binary unit that keeps it at or above 1.
export function scaleBytes(value: number): { value: number; unit: string } {
  let size = value;
  let unit = 0;
  while (Math.abs(size) >= 1024 && unit < BYTE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return { value: size, unit: BYTE_UNITS[unit] };
}

export interface RabbitmqFormatters {
  number: (value: number | null) => string;
  bytes: (value: number | null) => string;
  // A per-second rate, e.g. `1.5 /s` or `1.5 B/s`.
  rate: (value: number | null, suffix: string) => string;
  dateTime: (ms: number | null) => string;
  time: (ms: number | null) => string;
}

export function useRabbitmqFormatters(): RabbitmqFormatters {
  const integer = useNumberFormatter();
  const decimal = useNumberFormatter(ONE_DECIMAL);
  const formatDateTime = useDateTimeFormatter();
  const formatTime = useDateTimeFormatter(TIME_ONLY);

  const number = useCallback((value: number | null) => (value == null ? MISSING_VALUE : integer(value)), [integer]);
  const bytes = useCallback(
    (value: number | null) => {
      if (value == null) return MISSING_VALUE;
      const scaled = scaleBytes(value);
      return `${scaled.unit === 'B' ? integer(scaled.value) : decimal(scaled.value)} ${scaled.unit}`;
    },
    [integer, decimal],
  );
  const rate = useCallback(
    (value: number | null, suffix: string) => (value == null ? MISSING_VALUE : `${decimal(value)} ${suffix}`),
    [decimal],
  );
  const dateTime = useCallback(
    (ms: number | null) => (ms == null ? MISSING_VALUE : String(formatDateTime(ms, MISSING_VALUE))),
    [formatDateTime],
  );
  const time = useCallback(
    (ms: number | null) => (ms == null ? MISSING_VALUE : String(formatTime(ms, MISSING_VALUE))),
    [formatTime],
  );

  return useMemo(() => ({ number, bytes, rate, dateTime, time }), [number, bytes, rate, dateTime, time]);
}

// A localized duration (whole minutes) or the missing-value placeholder.
export function Duration({ ms }: { ms: number | null }) {
  const formatted = useFormatedDuration(ms == null ? 0 : Math.floor(ms / 60_000));
  return <>{ms == null ? MISSING_VALUE : formatted}</>;
}
