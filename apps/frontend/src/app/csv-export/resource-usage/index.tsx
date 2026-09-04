import {
  ResourceUsage,
  useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { CsvExportDrawerContent, ColumnDefinition } from '../export-drawer';
import { useQuery } from '@tanstack/react-query';
import { getBaseUrl } from '../../../api';

interface OperatingDurationSummary {
  operatingDataAvailable: boolean;
  operatingDurationMs: number | null;
  unattributedOperatingDurationMs: number | null;
  isProvisional: boolean;
}

const RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST = 100;

function durationMsForSession(item: ResourceUsage, asOf: Date): number {
  const now = new Date();
  const end = Math.min(new Date(item.endTime ?? now).getTime(), asOf.getTime(), now.getTime());
  return end - new Date(item.startTime).getTime();
}

export function ResourceUsageExport(props: ExportProps) {
  const { t } = useTranslations({
    de,
    en,
  });

  const [fetchAll, setFetchAll] = useState(false);

  const { data, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite({
      start: props.start.toISOString(),
      end: props.end.toISOString(),
    });

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
  const { data: operatingDurations, status: operatingDurationsStatus } = useQuery({
    queryKey: ['resource-operating-durations', resourceIds, props.start, props.end],
    queryFn: async ({ signal }) => {
      const operatingDurations: Record<number, OperatingDurationSummary> = {};
      for (let index = 0; index < resourceIds.length; index += RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST) {
        const response = await fetch(`${getBaseUrl()}/api/analytics/resource-operating-durations`, {
          method: 'POST',
          credentials: 'include',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resourceIds: resourceIds.slice(index, index + RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST),
            start: props.start.toISOString(),
            end: props.end.toISOString(),
          }),
        });
        if (!response.ok) throw new Error('Failed to load operating durations');
        Object.assign(operatingDurations, await response.json());
      }
      return operatingDurations;
    },
    enabled: resourceIds.length > 0 && !isFetchingAllPages,
  });

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
        label: t('columns.sessionDurationMs'),
        key: 'sessionDurationMs',
        getter: (item) => durationMsForSession(item, props.end),
        selectedByDefault: true,
      },
      {
        label: t('columns.operatingDurationMs'),
        key: 'operatingDurationMs',
        getter: (item) => operatingDurations?.[item.resourceId]?.operatingDurationMs ?? '',
        selectedByDefault: true,
      },
      {
        label: t('columns.unattributedOperatingDurationMs'),
        key: 'unattributedOperatingDurationMs',
        getter: (item) => operatingDurations?.[item.resourceId]?.unattributedOperatingDurationMs ?? '',
        selectedByDefault: true,
      },
      {
        label: t('columns.durationStatus'),
        key: 'durationStatus',
        getter: (item) => {
          const duration = operatingDurations?.[item.resourceId];
          if (!duration?.operatingDataAvailable) return t('status.unavailable');
          return duration.isProvisional ? t('status.provisional') : '';
        },
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
  }, [formatUsageDuration, formatDateTimeFull, operatingDurations, props.end, t]);

  // TODO: handle grouping by user and resource

  return (
    <CsvExportDrawerContent
      columns={columns as ColumnDefinition<ResourceUsage>[]}
      items={resourceUsageExport as ResourceUsage[]}
      refetch={refetch}
      options={options}
      setOption={setOption}
      filename="resource-usage.csv"
      queryStatus={
        fetchStatus !== 'success' ? fetchStatus : resourceIds.length > 0 ? operatingDurationsStatus : fetchStatus
      }
      onFetchAllPages={() => setFetchAll(true)}
      isFetchingAllPages={isFetchingAllPages}
    />
  );
}
