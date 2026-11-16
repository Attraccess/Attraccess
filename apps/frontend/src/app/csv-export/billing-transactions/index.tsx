import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ExportProps as ExporterProps } from '../export-props';
import de from './de.json';
import en from './en.json';
import {
  BillingTransactionExportRowDto,
  CsvExportType,
  useAnalyticsServiceGetBillingTransactionsInDateRangeInfinite,
  useBillingServiceGetBillingConfiguration,
} from '@attraccess/react-query-client';
import { CsvExportConfigContent } from '../export-config';
import { EXPORT_QUERY_OPTIONS } from '../export-config/query-options';
import { FieldDefinition, metadataFields } from '../export-config/csv';
import { useEffect, useMemo, useState } from 'react';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';

export function useBillingTransactionsExportState(props: ExporterProps) {
  const { start, end } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [fetchAll, setFetchAll] = useState(false);

  const {
    data,
    status: fetchStatus,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAnalyticsServiceGetBillingTransactionsInDateRangeInfinite(
    {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    undefined,
    EXPORT_QUERY_OPTIONS,
  );

  // ponytail: only fetch remaining pages after user clicks export
  useEffect(() => {
    if (fetchAll && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const billingTransactions = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const isFetchingAllPages = fetchAll && (hasNextPage || isFetchingNextPage);

  const { data: billingConfiguration, status: billingConfigurationFetchStatus } =
    useBillingServiceGetBillingConfiguration();

  const formatDateTimeFull = useDateTimeFormatter({ showDate: true, showTime: true, showSeconds: true });

  const columns = useMemo(() => {
    if (!billingConfiguration) {
      return [];
    }

    // Field keys are persisted in export templates: never rename an existing key.
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
        label: t('columns.correctionOf'),
        key: 'correctionOf',
        getter: (item) => item.correctionOfId?.toString() ?? '',
      },
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
      { label: t('columns.userId'), key: 'userId', getter: (item) => item.user?.id ?? item.userId },
      { label: t('columns.userEmail'), key: 'userEmail', getter: (item) => item.userEmail ?? '' },
      {
        label: t('columns.userExternalIdentifier'),
        key: 'userExternalIdentifier',
        getter: (item) => item.user?.externalIdentifier ?? '',
      },
      { label: t('columns.initiatorEmail'), key: 'initiatorEmail', getter: (item) => item.initiatorEmail ?? '' },
      ...metadataFields(
        billingTransactions,
        (item: BillingTransactionExportRowDto) => item.resourceUsage?.resource?.metadata,
        (key) => t('metadataField', { key }),
      ),
    ] as FieldDefinition<BillingTransactionExportRowDto>[];
  }, [t, billingConfiguration, formatDateTimeFull, billingTransactions]);

  return {
    columns,
    billingTransactions,
    queryStatus: billingConfigurationFetchStatus === 'success' ? fetchStatus : billingConfigurationFetchStatus,
    hasNextPage,
    isFetchingAllPages,
    setFetchAll,
  } as const;
}

export function BillingTransactionsExport(props: ExporterProps) {
  const { columns, billingTransactions, queryStatus, hasNextPage, isFetchingAllPages, setFetchAll } =
    useBillingTransactionsExportState(props);

  return (
    <CsvExportConfigContent
      exportType={CsvExportType.BILLING_TRANSACTIONS}
      queryStatus={queryStatus}
      items={billingTransactions as BillingTransactionExportRowDto[]}
      fields={columns}
      filename="billing-transactions.csv"
      allPagesLoaded={!hasNextPage}
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
