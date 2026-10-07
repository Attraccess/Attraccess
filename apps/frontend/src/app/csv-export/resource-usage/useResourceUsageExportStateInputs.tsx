import {
  AnalyticsService,
  useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { useQuery } from '@tanstack/react-query';
import {
  attributedDurationByResourceAndUsage,
  mergeOperatingDurationSummaries,
  operatingDurationWindows,
  type OperatingDurationSummary,
} from './operating-duration';
import { RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST } from './index.resource-ids-per-operating-duration-request';

export function useResourceUsageExportStateInputs(props: ExportProps) {
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
  const operatingDurationRanges = useMemo(
    () => operatingDurationWindows(props.start, props.end),
    [props.start, props.end],
  );
  const { data: operatingDurations, status: operatingDurationsStatus } = useQuery({
    queryKey: ['resource-operating-durations', resourceIds, props.start, props.end],
    queryFn: async ({ signal }) => {
      const operatingDurations: Record<number, OperatingDurationSummary> = {};
      for (let index = 0; index < resourceIds.length; index += RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST) {
        for (const range of operatingDurationRanges) {
          signal.throwIfAborted();
          const request = AnalyticsService.getResourceOperatingDurations({
            requestBody: {
              resourceIds: resourceIds.slice(index, index + RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST),
              start: range.start.toISOString(),
              end: range.end.toISOString(),
            },
          });
          const cancelRequest = () => request.cancel();
          signal.addEventListener('abort', cancelRequest, { once: true });
          try {
            mergeOperatingDurationSummaries(
              operatingDurations,
              (await request) as Record<number, OperatingDurationSummary>,
            );
          } finally {
            signal.removeEventListener('abort', cancelRequest);
          }
        }
      }
      return operatingDurations;
    },
    enabled: resourceIds.length > 0 && !isFetchingAllPages,
  });
  const attributedDurations = useMemo(
    () => attributedDurationByResourceAndUsage(operatingDurations),
    [operatingDurations],
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
  return {
    t,
    fetchAll,
    setFetchAll,
    data,
    status,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    resourceUsageExport,
    isFetchingAllPages,
    fetchStatus,
    resourceIds,
    operatingDurationRanges,
    operatingDurations,
    operatingDurationsStatus,
    attributedDurations,
    formatDateTimeFull,
    formatUsageDuration,
    activeOptions,
    setActiveOptions,
    options,
    setOption,
    props,
  } as const;
}
