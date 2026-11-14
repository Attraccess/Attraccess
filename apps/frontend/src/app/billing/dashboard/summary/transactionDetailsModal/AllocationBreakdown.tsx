import { Chip } from '@heroui/react';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { formatDurationMs } from '@attraccess/shared';

export interface AllocationSegment {
  startedAt: string;
  endedAt: string;
  participants: number;
  totalQuantity: string;
  totalCredits: number;
  shareQuantity: string;
  shareCredits: number;
}

export interface ItemAllocation {
  kind: 'meter' | 'operating-time';
  segments: AllocationSegment[];
}

/** The generated client types the allocation loosely; anything that is not a segment list is treated as solo. */
export function getItemAllocation(item: { allocation?: unknown }): ItemAllocation | null {
  const allocation = item.allocation as Partial<ItemAllocation> | null | undefined;
  if (!allocation || !Array.isArray(allocation.segments)) return null;
  return { kind: allocation.kind === 'operating-time' ? 'operating-time' : 'meter', segments: allocation.segments };
}

/** Exact sum of non-negative decimal strings (meter values keep arbitrary precision). */
export function sumDecimals(values: string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split('.')[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.');
    return sum + BigInt(whole + fraction.padEnd(scale, '0'));
  }, BigInt(0));
  const digits = total.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface Props {
  allocation: ItemAllocation;
  t: Translate;
  formatMeterValue: (value: string) => string;
  formatCredits: (credits: number | bigint) => string;
  /** The person's whole share as stored on the item (meter value or running time in ms). */
  shareValue: string | null | undefined;
}

function formatQuantity(allocation: ItemAllocation, value: string, formatMeterValue: Props['formatMeterValue']) {
  return allocation.kind === 'operating-time' ? formatDurationMs(Number(value)) : formatMeterValue(value);
}

/** Text such as "0.8 — your share of 2.4" for a shared item. */
export function allocationShareLine({ allocation, t, formatMeterValue, shareValue }: Omit<Props, 'formatCredits'>) {
  const total = sumDecimals(allocation.segments.map((segment) => segment.totalQuantity));
  const share = shareValue ?? sumDecimals(allocation.segments.map((segment) => segment.shareQuantity));
  return t('items.allocation.shareLine', {
    share: formatQuantity(allocation, share, formatMeterValue),
    total: formatQuantity(allocation, total, formatMeterValue),
  });
}

/** "Shared" marker plus the per-segment breakdown of a charge that was split between parallel sessions. */
export function AllocationBreakdown(props: Props) {
  const { allocation, t, formatMeterValue, formatCredits } = props;
  return (
    <div className="mt-1 flex flex-col gap-1" data-cy="allocation-breakdown">
      <div>
        <Chip size="sm" variant="soft" color="accent">
          {t('items.allocation.shared')}
        </Chip>
      </div>
      <div className="text-tiny text-default-500" data-cy="allocation-share-line">
        {allocationShareLine(props)}
      </div>
      <details className="text-tiny">
        <summary className="cursor-pointer text-default-600">{t('items.allocation.breakdown')}</summary>
        <ul className="mt-1 flex flex-col gap-1">
          {allocation.segments.map((segment) => (
            <li key={`${segment.startedAt}-${segment.endedAt}`} data-cy="allocation-segment">
              <div>
                <DateTimeDisplay date={segment.startedAt} /> – <DateTimeDisplay date={segment.endedAt} />
              </div>
              <div className="text-default-500">
                {t('items.allocation.segment', {
                  people: segment.participants,
                  total: formatQuantity(allocation, segment.totalQuantity, formatMeterValue),
                  totalCredits: formatCredits(segment.totalCredits),
                  share: formatQuantity(allocation, segment.shareQuantity, formatMeterValue),
                  shareCredits: formatCredits(segment.shareCredits),
                })}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
