import {
  ResourceUsage,
  useAnalyticsServiceGetResourceUsageHoursInDateRange,
} from '@attraccess/react-query-client';
import { ExportProps } from '../export-props';
import { useCallback, useMemo, useState } from 'react';
import { useDateTimeFormatter, useNumberFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { CsvExportDrawerContent, ColumnDefinition } from '../export-drawer';
import { CsvExportType } from '../export-drawer/template-api';

export function ResourceUsageExport(props: ExportProps) {
  const { t } = useTranslations({
    de,
    en,
  });

  const {
    data: resourceUsageExport,
    status: fetchStatus,
    refetch,
  } = useAnalyticsServiceGetResourceUsageHoursInDateRange({
    start: props.start.toISOString(),
    end: props.end.toISOString(),
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
      {
        label: t('columns.userExternalIdentifier'),
        key: 'userExternalIdentifier',
        getter: (item) => item.user?.externalIdentifier ?? '',
      },
      {
        label: t('columns.usageAction'),
        key: 'usageAction',
        getter: (item) => item.usageAction,
      },
      {
        label: t('columns.projectId'),
        key: 'projectId',
        getter: (item) => item.projectId ?? '',
      },
      {
        label: t('columns.isFinalized'),
        key: 'isFinalized',
        getter: (item) => String(item.isFinalized),
      },
      {
        label: t('columns.resourceType'),
        key: 'resourceType',
        getter: (item) => item.resource?.type ?? '',
      },
      {
        label: t('columns.resourceDescription'),
        key: 'resourceDescription',
        getter: (item) => item.resource?.description ?? '',
      },
    ] as ColumnDefinition<ResourceUsage>[];
  }, [formatUsageDuration, formatDateTimeFull, t]);

  // Dynamic columns for every custom metadata key found on the exported resources
  const metadataColumns = useMemo(() => {
    const keys = new Set<string>();
    (resourceUsageExport ?? []).forEach((item) => {
      Object.keys((item as ResourceUsage).resource?.metadata ?? {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map(
        (key) =>
          ({
            label: t('columns.resourceMetadata', { key }),
            key: `resourceMetadata.${key}`,
            getter: (item) => {
              const value = item.resource?.metadata?.[key];
              return value === undefined || value === null ? '' : String(value);
            },
          }) as ColumnDefinition<ResourceUsage>,
      );
  }, [resourceUsageExport, t]);

  const allColumns = useMemo(() => [...columns, ...metadataColumns], [columns, metadataColumns]);

  // TODO: handle grouping by user and resource

  return (
    <CsvExportDrawerContent
      columns={allColumns}
      items={(resourceUsageExport ?? []) as ResourceUsage[]}
      refetch={refetch}
      options={options}
      setOption={setOption}
      filename="resource-usage.csv"
      queryStatus={fetchStatus}
      exportType={CsvExportType.RESOURCE_USAGE_HOURS}
      onCancel={props.onCancel}
    />
  );
}
