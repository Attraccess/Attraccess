import {
  CsvExportType,
  ResourceUsageExportRowDto,
  useGetResourceUsageHoursInDateRangeInfinite,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { CsvExportConfigContent } from '../export-config';
import { EXPORT_QUERY_OPTIONS } from '../export-config/query-options';
import { useMemo, useCallback, useEffect, useState } from 'react';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { buildResourceUsageColumns } from './resourceUsageColumns';
import { useResourceOperatingDurations } from './useResourceOperatingDurations';

export function ResourceUsageExport(props: Readonly<ExportProps>) {
  const { t } = useTranslations({
    de,
    en,
  });

  const [fetchAll, setFetchAll] = useState(false);

  const { data, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useGetResourceUsageHoursInDateRangeInfinite(
      { query: { start: props.start.toISOString(), end: props.end.toISOString() } },
      undefined,
      EXPORT_QUERY_OPTIONS,
    );

  // ponytail: only fetch remaining pages after user clicks export
  useEffect(() => {
    if (fetchAll && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const resourceUsageExport = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const isFetchingAllPages = fetchAll && (hasNextPage || isFetchingNextPage);
  const fetchStatus = status === 'success' && isFetchingAllPages ? 'pending' : status;

  const resourceIds = useMemo(
    () => [...new Set(resourceUsageExport.map((usage) => usage.resourceId))],
    [resourceUsageExport],
  );
  const { operatingDurations, operatingDurationsStatus, attributedDurations } = useResourceOperatingDurations(
    resourceIds,
    props.start,
    props.end,
    !isFetchingAllPages,
  );

  const formatDateTimeFull = useDateTimeFormatter({ showDate: true, showTime: true, showSeconds: true });
  const formatUsageDuration = useNumberFormatter();

  const [activeOptions, setActiveOptions] = useState<string[]>([]);

  const options = useMemo(() => {
    return [
      {
        label: t('options.groupByUserAndResource'),
        key: 'groupByUserAndResource',
        value: activeOptions.includes('groupByUserAndResource'),
      },
    ];
  }, [activeOptions, t]);

  const setOption = useCallback((key: string, value: boolean) => {
    setActiveOptions((prev) => {
      if (value) {
        return [...prev, key];
      }
      return prev.filter((k) => k !== key);
    });
  }, []);

  const columns = useMemo(
    () =>
      buildResourceUsageColumns({
        t,
        formatDateTimeFull,
        formatUsageDuration,
        end: props.end,
        operatingDurations,
        attributedDurations,
        items: resourceUsageExport,
      }),
    [
      t,
      formatDateTimeFull,
      formatUsageDuration,
      props.end,
      operatingDurations,
      attributedDurations,
      resourceUsageExport,
    ],
  );

  // TODO: handle grouping by user and resource

  return (
    <CsvExportConfigContent
      exportType={CsvExportType.RESOURCE_USAGE_HOURS}
      fields={columns}
      items={resourceUsageExport as ResourceUsageExportRowDto[]}
      refetch={refetch}
      options={options}
      setOption={setOption}
      filename="resource-usage.csv"
      queryStatus={
        fetchStatus !== 'success' ? fetchStatus : resourceIds.length > 0 ? operatingDurationsStatus : fetchStatus
      }
      allPagesLoaded={!hasNextPage}
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
