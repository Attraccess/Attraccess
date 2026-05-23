// Selected range summary pill used in date range section and modal header
// FEATURE: CSV export — show selected date range as compact summary
import { Chip, DateValue, RangeValue } from '@heroui/react';
import { useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { getLocalTimeZone } from '@internationalized/date';
import { daysBetween } from './compute-range';
import { CalendarIcon, CalendarOffIcon } from 'lucide-react';

interface Props {
  range: RangeValue<DateValue> | null | undefined;
  emptyLabel: string;
  summaryLabel: (vars: { start: string; end: string; days: number }) => string;
  dataCy?: string;
}

export function SelectedRangePill(props: Props) {
  const { range, emptyLabel, summaryLabel, dataCy } = props;
  const formatDate = useDateTimeFormatter({ showTime: false });

  if (!range?.start || !range?.end) {
    return (
      <Chip variant="soft" color="default" data-cy={dataCy ?? 'csv-export-selected-range-pill'}>
        <CalendarOffIcon className="size-3.5" />
        {emptyLabel}
      </Chip>
    );
  }

  const start = String(formatDate(range.start.toDate(getLocalTimeZone())));
  const end = String(formatDate(range.end.toDate(getLocalTimeZone())));
  const days = daysBetween(range) ?? 0;

  return (
    <Chip variant="soft" color="accent" data-cy={dataCy ?? 'csv-export-selected-range-pill'}>
      <CalendarIcon className="size-3.5" />
      {summaryLabel({ start, end, days })}
    </Chip>
  );
}
