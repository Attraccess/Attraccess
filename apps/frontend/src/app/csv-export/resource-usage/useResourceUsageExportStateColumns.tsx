import { ResourceUsage } from '@attraccess/react-query-client';
import { useMemo } from 'react';
import { ColumnDefinition } from '../export-drawer';
import { combinedOperatingDurationStatus } from './operating-duration';
import { durationMsForSession } from './index.duration-ms-for-session';
import type { useResourceUsageExportStateInputs } from './useResourceUsageExportStateInputs';

export function useResourceUsageExportStateColumns(model: ReturnType<typeof useResourceUsageExportStateInputs>) {
  const { t, formatDateTimeFull, formatUsageDuration, props, operatingDurations, attributedDurations } = model;
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
        getter: (item) =>
          operatingDurations?.[item.resourceId]?.operatingDataAvailable
            ? (attributedDurations.get(item.resourceId)?.get(item.id) ?? 0)
            : '',
        selectedByDefault: true,
      },
      {
        label: t('columns.durationStatus'),
        key: 'durationStatus',
        getter: (item) =>
          combinedOperatingDurationStatus(operatingDurations?.[item.resourceId], {
            provisional: t('status.provisional'),
            unavailable: t('status.unavailable'),
          }),
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
  }, [attributedDurations, formatUsageDuration, formatDateTimeFull, operatingDurations, props.end, t]);
  return { ...model, columns } as const;
}
