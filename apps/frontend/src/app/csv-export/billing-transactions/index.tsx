import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ExportProps as ExporterProps } from '../export-props';
import de from './de.json';
import en from './en.json';
import {
  BillingTransaction,
  useAnalyticsServiceGetBillingTransactionsInDateRangeInfinite,
  useBillingServiceGetBillingConfiguration,
} from '@attraccess/react-query-client';
import { CsvExportDrawerContent, ColumnDefinition } from '../export-drawer';
import { useEffect, useMemo } from 'react';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';

export function BillingTransactionsExport(props: ExporterProps) {
  const { start, end } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const {
    data,
    status: fetchStatus,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAnalyticsServiceGetBillingTransactionsInDateRangeInfinite({
    start: start.toISOString(),
    end: end.toISOString(),
  });

  // Auto-fetch all pages for complete CSV export
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const billingTransactions = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const resolvedStatus = fetchStatus === 'success' && (hasNextPage || isFetchingNextPage) ? 'pending' : fetchStatus;

  const { data: billingConfiguration, status: billingConfigurationFetchStatus } =
    useBillingServiceGetBillingConfiguration();

  const formatDateTimeFull = useDateTimeFormatter({ showDate: true, showTime: true, showSeconds: true });

  const columns = useMemo(() => {
    if (!billingConfiguration) {
      return [];
    }

    return [
      { label: t('columns.id'), key: 'id', getter: (item) => item.id.toString(), selectedByDefault: true },
      { label: t('columns.user'), key: 'user', getter: (item) => item.user.username, selectedByDefault: true },
      {
        label: t('columns.createdAt'),
        key: 'createdAt',
        getter: (item) => formatDateTimeFull(item.createdAt),
        selectedByDefault: true,
      },
      {
        label: t('columns.amount'),
        key: 'amount',
        getter: (item) => dbCurrencyToUserCurrency(item.amount, billingConfiguration.minorUnit),
        selectedByDefault: true,
      },
      { label: t('columns.initiator'), key: 'initiator', getter: (item) => item.initiator?.username },
      {
        label: t('columns.resourceUsage'),
        key: 'resourceUsage',
        getter: (item) => item.resourceUsage?.resource?.name ?? '',
      },
      { label: t('columns.refundOf'), key: 'refundOf', getter: (item) => item.refundOfId?.toString() ?? '' },
      {
        label: t('columns.externalReference'),
        key: 'externalReference',
        getter: (item) => item.externalReference,
        selectedByDefault: true,
      },
      { label: t('columns.status'), key: 'status', getter: (item) => item.status, selectedByDefault: true },
      {
        label: t('columns.items'),
        key: 'items',
        getter: (item) =>
          item.items
            .map(
              (item) =>
                `${item.quantity}x ${item.name} @ ${dbCurrencyToUserCurrency(item.unitPrice, billingConfiguration.minorUnit)}`,
            )
            .join(', '),
      },
    ] as ColumnDefinition<BillingTransaction>[];
  }, [t, billingConfiguration, formatDateTimeFull]);

  return (
    <CsvExportDrawerContent
      queryStatus={billingConfigurationFetchStatus === 'success' ? resolvedStatus : billingConfigurationFetchStatus}
      items={billingTransactions as BillingTransaction[]}
      columns={columns}
      filename="billing-transactions.csv"
    />
  );
}
