import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardProps,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import {
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';
import { CalendarClockIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { EmptyState } from '../../../../components/emptyState';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useQueryClient } from '@tanstack/react-query';
import { MaintenanceScheduleUpsertModal } from './upsert';
import { ScheduleDeleteModal } from './ScheduleDeleteModal';

interface Props {
  resourceId: number;
}

function configSummary(
  schedule: ResourceMaintenanceSchedule,
  t: (key: string, params?: Record<string, number | string>) => string
): string {
  switch (schedule.triggerType) {
    case ResourceMaintenanceScheduleTriggerType.USAGE_HOURS: {
      const config = schedule.usageHoursConfig;
      if (!config) return '—';
      const { duration, unit } = config as { duration: number; unit: string };
      const key =
        unit === 'MINUTES'
          ? 'configSummary.usageHoursMinutes'
          : unit === 'HOURS'
            ? 'configSummary.usageHoursHours'
            : 'configSummary.usageHoursDays';
      return t(key, { duration });
    }
    case ResourceMaintenanceScheduleTriggerType.USAGE_COUNT:
      return schedule.usageCountConfig
        ? t('configSummary.usageCount', { count: schedule.usageCountConfig.thresholdSessions })
        : '—';
    case ResourceMaintenanceScheduleTriggerType.TIME_INTERVAL: {
      const config = schedule.timeIntervalConfig as { duration?: number; unit?: string } | undefined;
      if (!config) return '—';
      const { duration, unit } = config;
      const key =
        unit === 'MINUTES'
          ? 'configSummary.timeIntervalMinutes'
          : unit === 'HOURS'
            ? 'configSummary.timeIntervalHours'
            : 'configSummary.timeIntervalDays';
      return t(key, { duration: duration ?? 0 });
    }
    default:
      return '—';
  }
}

export function MaintenanceSchedules(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, ...cardProps } = props;
  const queryClient = useQueryClient();

  const { t } = useTranslations({
    de,
    en,
  });

  const { data: schedules = [] } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const { mutate: updateSchedule, isPending: isUpdating } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey] });
      },
    });

  const handleEnabledChange = (schedule: ResourceMaintenanceSchedule, enabled: boolean) => {
    updateSchedule({
      resourceId,
      scheduleId: schedule.id,
      requestBody: { enabled },
    });
  };

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader
          title={t('title')}
          icon={<CalendarClockIcon />}
          noMargin
          actions={
            <MaintenanceScheduleUpsertModal resourceId={resourceId}>
              {(open: () => void) => (
                <Button variant="primary" onPress={open}>
                  <PlusIcon className="w-4 h-4" />
                  {t('actions.add')}
                </Button>
              )}
            </MaintenanceScheduleUpsertModal>
          }
        />
      </CardHeader>

      <CardContent>
        <Table>
          <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('table.columns.name')}</TableColumn>
            <TableColumn>{t('table.columns.triggerType')}</TableColumn>
            <TableColumn>{t('table.columns.configSummary')}</TableColumn>
            <TableColumn>{t('table.columns.enabled')}</TableColumn>
            <TableColumn>{t('table.columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody<ResourceMaintenanceSchedule>
            items={schedules}
            renderEmptyState={() => <EmptyState message={t('empty')} />}
          >
            {(schedule) => (
              <TableRow key={schedule.id} id={schedule.id}>
                <TableCell>{schedule.name ?? '—'}</TableCell>
                <TableCell>{t(`triggerType.${schedule.triggerType}`)}</TableCell>
                <TableCell>{configSummary(schedule, t)}</TableCell>
                <TableCell>
                  <LabeledSwitch
                    isSelected={schedule.enabled}
                    onChange={(enabled) => handleEnabledChange(schedule, enabled)}
                    isDisabled={isUpdating}
                    aria-label={schedule.enabled ? 'Disable' : 'Enable'}
                  />
                </TableCell>
                <TableCell>
                  <MaintenanceScheduleUpsertModal resourceId={resourceId} scheduleId={schedule.id}>
                    {(open: () => void) => (
                      <Button variant="ghost" onPress={open} isIconOnly>
                        <PencilIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </MaintenanceScheduleUpsertModal>
                  <ScheduleDeleteModal resourceId={resourceId} schedule={schedule}>
                    {(open: () => void) => (
                      <Button variant="danger-soft" onPress={open} isIconOnly>
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </ScheduleDeleteModal>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </TableContent>
        </Table>
      </CardContent>
    </Card>
  );
}
