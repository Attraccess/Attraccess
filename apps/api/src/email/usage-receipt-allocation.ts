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

/** Receipt fields for a charge that is a share of a machine used by several people at once. */
export function describeAllocation(
  item: BillingTransactionItem,
  secondsFormatter: Intl.NumberFormat,
  minorUnit: number,
) {
  const allocation = item.allocation;
  const isSharedMeter = allocation?.kind === 'meter';
  const isSharedOperatingTime = allocation?.kind === 'operating-time';
  // Running time is whole milliseconds, shown as seconds like every other duration on the receipt.
  const quantity = (value: string) => (isSharedOperatingTime ? secondsFormatter.format(Number(value) / 1000) : value);
  const credits = (value: number) => formatCredits(value, minorUnit, { useGrouping: false });
  const segments = allocation?.segments ?? [];
  return {
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
    segments: segments.map((segment) => ({
      startedAt: segment.startedAt,
      endedAt: segment.endedAt,
      participants: segment.participants,
      totalQuantity: quantity(segment.totalQuantity),
      totalCredits: credits(segment.totalCredits),
      shareQuantity: quantity(segment.shareQuantity),
      shareCredits: credits(segment.shareCredits),
    })),
  };
}
