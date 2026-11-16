import { BillingTransactionItem } from '@attraccess/database-entities';
import { formatCredits } from '@attraccess/shared';

/** Adds `value` decimal strings exactly; whole milliseconds and meter decimals alike. */
function sumDecimals(values: string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split('.')[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.');
    const negative = whole.startsWith('-');
    const digits = BigInt(`${whole.replace('-', '')}${fraction.padEnd(scale, '0')}`);
    return sum + (negative ? -digits : digits);
  }, BigInt(0));
  const sign = total < BigInt(0) ? '-' : '';
  const digits = (total < BigInt(0) ? -total : total).toString().padStart(scale + 1, '0');
  if (scale === 0) return `${sign}${digits}`;
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  const whole = digits.slice(0, -scale);
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Formats a segment's time range in the receipt's language: "20.09.26, 10:00 – 10:30" on one day, both dates
 * otherwise. Times are in the zone of the API process, which is named on the end.
 */
export function segmentRangeFormatter(locale: string, timeZone?: string) {
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone });
  const start = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone });
  const endSameDay = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  });
  const endOtherDay = new Intl.DateTimeFormat(locale, {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  });
  return (startedAt: string, endedAt: string) => {
    const from = new Date(startedAt);
    const to = new Date(endedAt);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { start: startedAt, end: endedAt };
    return {
      start: start.format(from),
      end: (day.format(from) === day.format(to) ? endSameDay : endOtherDay).format(to),
    };
  };
}

export type SegmentRangeFormatter = ReturnType<typeof segmentRangeFormatter>;

/** Number and time formatters of a receipt in the reader's language. */
export function receiptFormatters(locale: string): {
  secondsFormatter: Intl.NumberFormat;
  formatRange: SegmentRangeFormatter;
} {
  const secondsFormatOptions = { maximumFractionDigits: 3 };
  try {
    return {
      secondsFormatter: new Intl.NumberFormat(locale, secondsFormatOptions),
      formatRange: segmentRangeFormatter(locale),
    };
  } catch {
    // Persisted locales are not restricted to valid Intl tags. Match the default email language.
    return {
      secondsFormatter: new Intl.NumberFormat('en', secondsFormatOptions),
      formatRange: segmentRangeFormatter('en'),
    };
  }
}

/** Receipt fields for a charge that is a share of a machine used by several people at once. */
export function describeAllocation(
  item: BillingTransactionItem,
  secondsFormatter: Intl.NumberFormat,
  minorUnit: number,
  formatRange: SegmentRangeFormatter,
) {
  // A share that is not known yet carries no segments: it is charged later, so it is not shown as shared.
  const isSharePending = item.allocation?.pending === true;
  const allocation = isSharePending ? null : item.allocation;
  const isSharedMeter = allocation?.kind === 'meter';
  const isSharedOperatingTime = allocation?.kind === 'operating-time';
  // Running time is whole milliseconds, shown as seconds like every other duration on the receipt.
  const quantity = (value: string) => (isSharedOperatingTime ? secondsFormatter.format(Number(value) / 1000) : value);
  const credits = (value: number) => formatCredits(value, minorUnit, { useGrouping: false });
  const segments = allocation?.segments ?? [];
  return {
    isSharePending,
    isShared: allocation != null,
    isSharedMeter,
    isSharedOperatingTime,
    shareQuantity: allocation
      ? quantity(
          isSharedMeter
            ? (item.meterQuantity ?? sumDecimals(segments.map((s) => s.shareQuantity)))
            : String(item.durationMs ?? sumDecimals(segments.map((s) => s.shareQuantity))),
        )
      : undefined,
    totalQuantity: allocation ? quantity(sumDecimals(segments.map((segment) => segment.totalQuantity))) : undefined,
    segments: segments.map((segment) => {
      const range = formatRange(segment.startedAt, segment.endedAt);
      return {
        startedAt: range.start,
        endedAt: range.end,
        participants: segment.participants,
        totalQuantity: quantity(segment.totalQuantity),
        totalCredits: credits(segment.totalCredits),
        shareQuantity: quantity(segment.shareQuantity),
        shareCredits: credits(segment.shareCredits),
      };
    }),
  };
}
