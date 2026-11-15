import { Accordion, Chip } from '@heroui/react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { formatDurationMs } from '@attraccess/shared';
import de from './de.json';
import en from './en.json';

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
  /** The share is not known yet; it is charged later as a separate correction. */
  pending?: boolean;
}

/** The generated client types the allocation loosely; anything that is not a segment list is treated as solo. */
export function getItemAllocation(item: { allocation?: unknown }): ItemAllocation | null {
  const allocation = item.allocation as Partial<ItemAllocation> | null | undefined;
  if (!allocation || !Array.isArray(allocation.segments)) return null;
  return {
    kind: allocation.kind === 'operating-time' ? 'operating-time' : 'meter',
    segments: allocation.segments,
    pending: allocation.pending === true,
  };
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

type FormatMeterValue = (value: string) => string;
type FormatCredits = (credits: number | bigint) => string;

function formatQuantity(allocation: ItemAllocation, value: string, formatMeterValue: FormatMeterValue) {
  return allocation.kind === 'operating-time' ? formatDurationMs(Number(value)) : formatMeterValue(value);
}

function sameDay(left: string, right: string) {
  return new Date(left).toDateString() === new Date(right).toDateString();
}

interface ShareProps {
  allocation: ItemAllocation;
  formatMeterValue: FormatMeterValue;
  /** The person's whole share as stored (meter value or running time in ms); summed from the segments otherwise. */
  shareValue?: string | null;
  /** The share of a running session, which still grows. */
  soFar?: boolean;
}

/** Text such as "0.8 — your share of 2.4" for a shared charge. */
export function useAllocationShareLine() {
  const { t } = useTranslations({ en, de });
  return ({ allocation, formatMeterValue, shareValue, soFar }: ShareProps) => {
    const total = sumDecimals(allocation.segments.map((segment) => segment.totalQuantity));
    const share = shareValue ?? sumDecimals(allocation.segments.map((segment) => segment.shareQuantity));
    return t(soFar ? 'shareLineSoFar' : 'shareLine', {
      share: formatQuantity(allocation, share, formatMeterValue),
      total: formatQuantity(allocation, total, formatMeterValue),
    });
  };
}

/** The "Shared" marker and the share against the total, compact enough for a table cell. */
export function AllocationShareSummary(props: ShareProps) {
  const { t } = useTranslations({ en, de });
  const shareLine = useAllocationShareLine();
  return (
    <div className="mt-1 flex flex-col items-start gap-1" data-cy="allocation-summary">
      <Chip size="sm" variant="soft" color="accent">
        {t('shared')}
      </Chip>
      <div className="text-tiny text-default-500" data-cy="allocation-share-line">
        {shareLine(props)}
      </div>
    </div>
  );
}

export interface AllocationBreakdownEntry {
  id: string | number;
  /** What the charge is for, e.g. the meter or item name. */
  name: string;
  allocation: ItemAllocation;
  /** The last segment is still open: its values change until the next reading. */
  provisional?: boolean;
}

interface BreakdownProps {
  entries: AllocationBreakdownEntry[];
  formatMeterValue: FormatMeterValue;
  formatCredits: FormatCredits;
}

/** One collapsible per shared charge, listing every segment the person took part in. Meant for full width. */
export function AllocationBreakdown({ entries, formatMeterValue, formatCredits }: BreakdownProps) {
  const { t } = useTranslations({ en, de });
  const shown = entries.filter((entry) => !entry.allocation.pending && entry.allocation.segments.length > 0);
  if (!shown.length) return null;
  return (
    <Accordion data-cy="allocation-breakdown">
      {shown.map(({ id, name, allocation, provisional }) => (
        <Accordion.Item key={id} id={String(id)}>
          <Accordion.Heading>
            <Accordion.Trigger className="text-small">
              {t('breakdown', { name })}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              <ul className="flex flex-col gap-2 text-tiny">
                {allocation.segments.map((segment, index) => {
                  const open = provisional && index === allocation.segments.length - 1;
                  return (
                    <li key={`${segment.startedAt}-${index}`} data-cy="allocation-segment">
                      <div className="font-medium">
                        <DateTimeDisplay date={segment.startedAt} /> –{' '}
                        {open ? (
                          <>
                            <span>{t('now')}</span>{' '}
                            <span className="font-normal text-default-500">{`(${t('provisional')})`}</span>
                          </>
                        ) : (
                          <DateTimeDisplay
                            date={segment.endedAt}
                            options={{ showDate: !sameDay(segment.startedAt, segment.endedAt) }}
                          />
                        )}
                      </div>
                      <div className="text-default-500">
                        {t('segment', {
                          people: t('people', { count: segment.participants }),
                          total: formatQuantity(allocation, segment.totalQuantity, formatMeterValue),
                          totalCredits: formatCredits(segment.totalCredits),
                          share: formatQuantity(allocation, segment.shareQuantity, formatMeterValue),
                          shareCredits: formatCredits(segment.shareCredits),
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
