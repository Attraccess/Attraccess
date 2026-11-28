import { formatUserDisplayName } from '@attraccess/shared';
import type { ReactNode } from 'react';
import type { ResourceUsageExportRowDto } from '@attraccess/react-query-client';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { FieldDefinition, metadataFields } from '../export-config/csv';
import { combinedOperatingDurationStatus } from './operating-duration';
import type { OperatingDurationSummary } from './operating-duration';

export function durationMsForSession(item: ResourceUsageExportRowDto, asOf: Date): number {
  const now = new Date();
  const end = Math.min(new Date(item.endTime ?? now).getTime(), asOf.getTime(), now.getTime());
  return end - new Date(item.startTime).getTime();
}

interface ResourceUsageColumnsInput {
  t: TFunction;
  formatDateTimeFull: (date?: Date | string | number | null) => ReactNode;
  formatUsageDuration: (value: number) => string;
  /** End of the exported range; open sessions are measured up to this instant. */
  end: Date;
  operatingDurations: Record<number, OperatingDurationSummary> | undefined;
  attributedDurations: Map<number, Map<number, number>>;
  items: ResourceUsageExportRowDto[];
}

/** The fields offered for the resource usage CSV export. Field keys are persisted in export templates: never rename an existing key. */
export function buildResourceUsageColumns({
  t,
  formatDateTimeFull,
  formatUsageDuration,
  end,
  operatingDurations,
  attributedDurations,
  items,
}: ResourceUsageColumnsInput): FieldDefinition<ResourceUsageExportRowDto>[] {
  // translated once per rebuild, not once per row (each t() call compiles its template)
  const statusLabels = { provisional: t('status.provisional'), unavailable: t('status.unavailable') };
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
      label: t('columns.userDisplayName'),
      key: 'userDisplayName',
      getter: (item) => (item.user ? formatUserDisplayName(item.user) : ''),
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
      getter: (item) => durationMsForSession(item, end),
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
    {
      label: t('columns.supervisorDisplayName'),
      key: 'supervisorDisplayName',
      getter: (item) => (item.supervisorUser ? formatUserDisplayName(item.supervisorUser) : ''),
    },
    { label: t('columns.sessionId'), key: 'sessionId', getter: (item) => item.id },
    {
      // Set on a record that continues a session after a project switch.
      label: t('columns.previousUsageId'),
      key: 'previousUsageId',
      getter: (item) => item.previousUsageId ?? '',
    },
    { label: t('columns.userEmail'), key: 'userEmail', getter: (item) => item.userEmail ?? '' },
    {
      label: t('columns.userExternalIdentifier'),
      key: 'userExternalIdentifier',
      getter: (item) => item.user?.externalIdentifier ?? '',
    },
    { label: t('columns.supervisorEmail'), key: 'supervisorEmail', getter: (item) => item.supervisorEmail ?? '' },
    ...metadataFields(
      items,
      (item: ResourceUsageExportRowDto) => item.resource?.metadata,
      (key) => t('metadataField', { key }),
    ),
  ] as FieldDefinition<ResourceUsageExportRowDto>[];
}
