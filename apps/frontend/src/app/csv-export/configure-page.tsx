// Dedicated configuration page for one CSV export type
// FEATURE: CSV export — /csv-export/<type> shows template, columns, preview and download as normal page content
import { PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BillingTransactionsExport } from './billing-transactions';
import { SelectedRangePill } from './date-range-section/selected-range-pill';
import { boundsToRange, boundsToSearch, parseRangeSearchParams, ExportTypeKey } from './range-search-params';
import { ResourceHoursSummaryExport } from './resource-hours-summary';
import { ResourceUsageExport } from './resource-usage';
import de from './de.json';
import en from './en.json';

interface Props {
  exportKey: ExportTypeKey;
}

export function CsvExportConfigurePage({ exportKey }: Props) {
  const { t } = useTranslations({ de, en });
  const [searchParams] = useSearchParams();

  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  // Keyed on the raw params so the Date objects (and the data queries built from them) stay stable across renders.
  const bounds = useMemo(
    () => parseRangeSearchParams(new URLSearchParams({ start: startParam ?? '', end: endParam ?? '' })),
    [startParam, endParam],
  );
  const range = useMemo(() => boundsToRange(bounds), [bounds]);

  const Export = {
    resourceUsageHours: ResourceUsageExport,
    resourceHoursSummary: ResourceHoursSummaryExport,
    billingTransactions: BillingTransactionsExport,
  }[exportKey];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8" data-cy="csv-export-page">
      <PageHeader
        title={t(`exports.${exportKey}.title`)}
        subtitle={
          <SelectedRangePill
            range={range}
            emptyLabel={t('range.empty')}
            summaryLabel={({ start, end, days }) => t('range.summary', { start, end, count: days })}
            dataCy="csv-export-page-range-pill"
          />
        }
        backTo={`/csv-export?${boundsToSearch(bounds)}`}
        noMargin
      />

      <Export start={bounds.start} end={bounds.end} />
    </div>
  );
}

export function ResourceUsageExportPage() {
  return <CsvExportConfigurePage exportKey="resourceUsageHours" />;
}

export function BillingTransactionsExportPage() {
  return <CsvExportConfigurePage exportKey="billingTransactions" />;
}

export function ResourceHoursSummaryExportPage() {
  return <CsvExportConfigurePage exportKey="resourceHoursSummary" />;
}
