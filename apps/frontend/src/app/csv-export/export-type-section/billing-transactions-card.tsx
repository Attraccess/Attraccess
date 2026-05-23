// Billing transactions export card — fetches row count when range is set
// FEATURE: CSV export — step 2 of new export flow
import { DateValue, RangeValue } from '@heroui/react';
import { useAnalyticsServiceGetBillingTransactionsInDateRange } from '@attraccess/react-query-client';
import { getLocalTimeZone } from '@internationalized/date';
import { CreditCardIcon } from 'lucide-react';
import { ExportTypeCard } from './export-type-card';

interface Props {
  range: RangeValue<DateValue> | null;
  onPress: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function BillingTransactionsCard(props: Props) {
  const { range, onPress, t } = props;

  const hasRange = Boolean(range?.start && range?.end);
  const start = range?.start ? range.start.toDate(getLocalTimeZone()).toISOString() : '';
  const end = range?.end ? range.end.toDate(getLocalTimeZone()).toISOString() : '';

  const { data, status } = useAnalyticsServiceGetBillingTransactionsInDateRange(
    { start, end },
    [start, end],
    { enabled: hasRange },
  );

  return (
    <ExportTypeCard
      Icon={CreditCardIcon}
      title={t('exports.billingTransactions.title')}
      description={t('exports.billingTransactions.description')}
      rowCount={data?.length}
      rowCountStatus={hasRange ? status : 'idle'}
      estimatedLabel={({ count }) => t('exports.card.estimatedRows', { count })}
      loadingLabel={t('exports.card.estimatedRowsLoading')}
      ctaLabel={t('exports.card.cta')}
      requireRangeLabel={t('exports.card.requireRange')}
      isDisabled={!hasRange}
      onPress={onPress}
      dataCy="csv-export-billingTransactions"
    />
  );
}
