import {
  CsvExportType,
  ResourceHoursSummaryRowDto,
  useAnalyticsServiceGetResourceHoursSummaryInDateRangeInfinite,
} from '@attraccess/react-query-client';
import { useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useEffect, useMemo, useState } from 'react';
import { ExportProps } from '../export-props';
import { CsvExportConfigContent } from '../export-config';
import { FieldDefinition, metadataFields } from '../export-config/csv';
import { EXPORT_QUERY_OPTIONS } from '../export-config/query-options';
import { combinedOperatingDurationStatus } from '../resource-usage/operating-duration';
import de from './de.json';
import en from './en.json';

const MS_PER_HOUR = 3_600_000;

export type ResourceHoursSummaryRow = ResourceHoursSummaryRowDto & { id: number };

export function useResourceHoursSummaryColumns(rows: ResourceHoursSummaryRow[]) {
  const { t } = useTranslations({ de, en });
  const formatNumber = useNumberFormatter();

  return useMemo(() => {
    const statusLabels = { provisional: t('status.provisional'), unavailable: t('status.unavailable') };
    const hours = (durationMs: number | null) => (durationMs === null ? '' : formatNumber(durationMs / MS_PER_HOUR));
    // Field keys are persisted in export templates: never rename an existing key.
    return [
      { label: t('columns.resourceId'), key: 'resourceId', getter: (row) => row.resourceId, selectedByDefault: true },
      {
        label: t('columns.resourceName'),
        key: 'resourceName',
        getter: (row) => row.resourceName,
        selectedByDefault: true,
      },
      { label: t('columns.sessions'), key: 'sessions', getter: (row) => row.sessionCount, selectedByDefault: true },
      {
        label: t('columns.personHours'),
        key: 'personHours',
        getter: (row) => hours(row.personDurationMs),
        selectedByDefault: true,
      },
      {
        label: t('columns.machineHours'),
        key: 'machineHours',
        getter: (row) => hours(row.sessionDurationMs),
        selectedByDefault: true,
      },
      {
        label: t('columns.machineRunningHours'),
        key: 'machineRunningHours',
        getter: (row) => hours(row.operatingDurationMs),
        selectedByDefault: true,
      },
      {
        label: t('columns.outsideSessionHours'),
        key: 'outsideSessionHours',
        getter: (row) => hours(row.unattributedOperatingDurationMs),
      },
      {
        label: t('columns.durationStatus'),
        key: 'durationStatus',
        getter: (row) => combinedOperatingDurationStatus(row, statusLabels),
        selectedByDefault: true,
      },
      ...metadataFields(
        rows,
        (row: ResourceHoursSummaryRow) => row.metadata,
        (key) => t('metadataField', { key }),
      ),
    ] as FieldDefinition<ResourceHoursSummaryRow>[];
  }, [formatNumber, rows, t]);
}

export function ResourceHoursSummaryExport({ start, end }: ExportProps) {
  const [fetchAll, setFetchAll] = useState(false);
  const { data, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useAnalyticsServiceGetResourceHoursSummaryInDateRangeInfinite(
      { start: start.toISOString(), end: end.toISOString() },
      undefined,
      EXPORT_QUERY_OPTIONS,
    );

  // only fetch the remaining pages after the user clicked export
  useEffect(() => {
    if (fetchAll && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.data).map((row) => ({ ...row, id: row.resourceId })) ?? [],
    [data],
  );
  const isFetchingAllPages = fetchAll && (hasNextPage || isFetchingNextPage);
  const columns = useResourceHoursSummaryColumns(rows);

  return (
    <CsvExportConfigContent
      exportType={CsvExportType.RESOURCE_HOURS_SUMMARY}
      fields={columns}
      items={rows}
      refetch={refetch}
      filename="resource-hours-summary.csv"
      queryStatus={status === 'success' && isFetchingAllPages ? 'pending' : status}
      allPagesLoaded={!hasNextPage}
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
