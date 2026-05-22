// Resource usage export card — fetches row count when range is set
// FEATURE: CSV export — step 2 of new export flow
import { DateValue, RangeValue } from '@heroui/react';
import { useAnalyticsServiceGetResourceUsageHoursInDateRange } from '@attraccess/react-query-client';
import { getLocalTimeZone } from '@internationalized/date';
import { DatabaseIcon } from 'lucide-react';
import { ExportTypeCard } from './export-type-card';

interface Props {
  range: RangeValue<DateValue> | null;
  onPress: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function ResourceUsageCard(props: Props) {
  const { range, onPress, t } = props;

  const hasRange = Boolean(range?.start && range?.end);
  const start = range?.start ? range.start.toDate(getLocalTimeZone()).toISOString() : '';
  const end = range?.end ? range.end.toDate(getLocalTimeZone()).toISOString() : '';

  const { data, status } = useAnalyticsServiceGetResourceUsageHoursInDateRange(
    { start, end },
    [start, end],
    { enabled: hasRange },
  );

  return (
    <ExportTypeCard
      Icon={DatabaseIcon}
      title={t('exports.resourceUsageHours.title')}
      description={t('exports.resourceUsageHours.description')}
      rowCount={data?.length}
      rowCountStatus={hasRange ? status : 'idle'}
      estimatedLabel={({ count }) => t('exports.card.estimatedRows', { count })}
      loadingLabel={t('exports.card.estimatedRowsLoading')}
      ctaLabel={t('exports.card.cta')}
      requireRangeLabel={t('exports.card.requireRange')}
      isDisabled={!hasRange}
      onPress={onPress}
      dataCy="csv-export-resourceUsageHours"
    />
  );
}
