import {
  AnalyticsService,
  CsvExportType,
  ResourceUsageExportRowDto,
  useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { CsvExportConfigContent } from '../export-config';
import { EXPORT_QUERY_OPTIONS } from '../export-config/query-options';
import { FieldDefinition, metadataFields } from '../export-config/csv';
import { useMemo, useCallback, useEffect, useState } from 'react';
import {
  combinedOperatingDurationStatus,
  attributedDurationByResourceAndUsage,
  mergeOperatingDurationSummaries,
  operatingDurationWindows,
} from './operating-duration';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { useQuery } from '@tanstack/react-query';
import type { OperatingDurationSummary } from './operating-duration';

export function durationMsForSession(item: ResourceUsageExportRowDto, asOf: Date): number {
  const now = new Date();
  const end = Math.min(new Date(item.endTime ?? now).getTime(), asOf.getTime(), now.getTime());
  return end - new Date(item.startTime).getTime();
}

export const RESOURCE_IDS_PER_OPERATING_DURATION_REQUEST = 100;

export function useResourceUsageExportStateInputs(props: ExportProps) {
  const { t } = useTranslations({
    de,
    en,
  });

  const [fetchAll, setFetchAll] = useState(false);

  const { data, status, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useAnalyticsServiceGetResourceUsageHoursInDateRangeInfinite(
      {
        start: props.start.toISOString(),
        end: props.end.toISOString(),
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
    // refocusing the tab must not re-request the durations of every loaded resource
    refetchOnWindowFocus: false,
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

export function useResourceUsageExportStateColumns(model: ReturnType<typeof useResourceUsageExportStateInputs>) {
  const {
    t,
    formatDateTimeFull,
    formatUsageDuration,
    props,
    operatingDurations,
    attributedDurations,
    resourceUsageExport,
  } = model;
  const columns = useMemo(() => {
    // translated once per rebuild, not once per row (each t() call compiles its template)
    const statusLabels = { provisional: t('status.provisional'), unavailable: t('status.unavailable') };
    // Field keys are persisted in export templates: never rename an existing key.
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
        getter: (item) =>
          operatingDurations?.[item.resourceId]?.operatingDataAvailable
            ? (attributedDurations.get(item.resourceId)?.get(item.id) ?? 0)
            : '',
        selectedByDefault: true,
      },
      {
        label: t('columns.durationStatus'),
        key: 'durationStatus',
        getter: (item) => combinedOperatingDurationStatus(operatingDurations?.[item.resourceId], statusLabels),
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
      { label: t('columns.userEmail'), key: 'userEmail', getter: (item) => item.userEmail ?? '' },
      {
        label: t('columns.userExternalIdentifier'),
        key: 'userExternalIdentifier',
        getter: (item) => item.user?.externalIdentifier ?? '',
      },
      { label: t('columns.supervisorEmail'), key: 'supervisorEmail', getter: (item) => item.supervisorEmail ?? '' },
      ...metadataFields(
        resourceUsageExport,
        (item: ResourceUsageExportRowDto) => item.resource?.metadata,
        (key) => t('metadataField', { key }),
      ),
    ] as FieldDefinition<ResourceUsageExportRowDto>[];
  }, [
    attributedDurations,
    formatUsageDuration,
    formatDateTimeFull,
    operatingDurations,
    props.end,
    resourceUsageExport,
    t,
  ]);
  return { ...model, columns } as const;
}

export function useResourceUsageExportStateOutput(model: ReturnType<typeof useResourceUsageExportStateColumns>) {
  return {
    setFetchAll: model.setFetchAll,
    refetch: model.refetch,
    resourceUsageExport: model.resourceUsageExport,
    isFetchingAllPages: model.isFetchingAllPages,
    fetchStatus: model.fetchStatus,
    hasNextPage: model.hasNextPage,
    resourceIds: model.resourceIds,
    operatingDurationsStatus: model.operatingDurationsStatus,
    options: model.options,
    setOption: model.setOption,
    columns: model.columns,
  } as const;
}

export function useResourceUsageExportState(props: ExportProps) {
  const useResourceUsageExportStateInputsModel = useResourceUsageExportStateInputs(props);
  const useResourceUsageExportStateColumnsModel = useResourceUsageExportStateColumns(
    useResourceUsageExportStateInputsModel,
  );
  return useResourceUsageExportStateOutput(useResourceUsageExportStateColumnsModel);
}

export function ResourceUsageExport(props: ExportProps) {
  const {
    setFetchAll,
    refetch,
    resourceUsageExport,
    isFetchingAllPages,
    fetchStatus,
    hasNextPage,
    resourceIds,
    operatingDurationsStatus,
    options,
    setOption,
    columns,
  } = useResourceUsageExportState(props);

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
