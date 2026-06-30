import { ResourceUsage, useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite } from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { CsvExportDrawerContent, ColumnDefinition } from '../export-drawer';

export function ResourceUsageExport(props: ExportProps) {
  const { t } = useTranslations({
    de,
    en,
  });

  const [fetchAll, setFetchAll] = useState(false);

  const {
    data,
    status,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite({
    start: props.start.toISOString(),
    end: props.end.toISOString(),
  });

  // ponytail: only fetch remaining pages after user clicks export
  useEffect(() => {
    if (fetchAll && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchAll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const resourceUsageExport = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const isFetchingAllPages = fetchAll && (hasNextPage || isFetchingNextPage);
  const fetchStatus = status === 'success' && isFetchingAllPages ? 'pending' : status;

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

  const columns = useMemo(() => {
    return [
      {
        label: t('columns.resourceId'),
        key: 'resourceId',
        getter: (item) => item.resource?.id,
        selectedByDefault: true,
      },
      {
        label: t('columns.resourceName'),
        key: 'resourceName',
        getter: (item) => item.resource?.name,
        selectedByDefault: true,
      },
      {
        label: t('columns.userId'),
        key: 'userId',
        getter: (item) => item.user?.id,
        selectedByDefault: true,
      },
      {
        label: t('columns.username'),
        key: 'username',
        getter: (item) => item.user?.username,
        selectedByDefault: true,
      },
      {
        label: t('columns.startTimeISO'),
        key: 'startTimeISO',
        getter: (item) => item.startTime,
      },
      {
        label: t('columns.startTime'),
        key: 'startTime',
        getter: (item) => formatDateTimeFull(item.startTime),
      },
      {
        label: t('columns.endTimeISO'),
        key: 'endTimeISO',
        getter: (item) => item.endTime,
      },
      {
        label: t('columns.endTime'),
        key: 'endTime',
        getter: (item) => formatDateTimeFull(item.endTime),
      },
      {
        label: t('columns.usageInMinutes'),
        key: 'usageInMinutes',
        getter: (item) => formatUsageDuration(item.usageInMinutes),
      },
      {
        label: t('columns.usageInHours'),
        key: 'usageInHours',
        getter: (item) => formatUsageDuration(item.usageInMinutes / 60),
        selectedByDefault: true,
      },
      {
        label: t('columns.startNotes'),
        key: 'startNotes',
        getter: (item) => item.startNotes ?? '',
      },
      {
        label: t('columns.endNotes'),
        key: 'endNotes',
        getter: (item) => item.endNotes ?? '',
      },
      {
        label: t('columns.supervisorId'),
        key: 'supervisorId',
        getter: (item) => item.supervisorUserId ?? '',
      },
      {
        label: t('columns.supervisorUsername'),
        key: 'supervisorUsername',
        getter: (item) => item.supervisorUser?.username ?? '',
      },
    ] as ColumnDefinition<ResourceUsage>[];
  }, [formatUsageDuration, formatDateTimeFull, t]);

  // TODO: handle grouping by user and resource

  return (
    <CsvExportDrawerContent
      columns={columns as ColumnDefinition<ResourceUsage>[]}
      items={resourceUsageExport as ResourceUsage[]}
      refetch={refetch}
      options={options}
      setOption={setOption}
      filename="resource-usage.csv"
      queryStatus={fetchStatus}
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
