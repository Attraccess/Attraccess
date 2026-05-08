import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardProps,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
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
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
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

  const { data: schedules = [], status: fetchStatus } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const { mutate: updateSchedule, isPending: isUpdating } =
    useResourceMaintenanceSchedulesServiceUpdateMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey] });
      },
    });

  const tableLoadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

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
                <Button
                  onPress={open}
                  color="primary"
                  size="sm"
                  title={t('actions.add')}
                  startContent={<PlusIcon className="w-4 h-4" />}
                >
                  {t('actions.add')}
                </Button>
              )}
            </MaintenanceScheduleUpsertModal>
          }
        />
      </CardHeader>

      <CardContent>
        <Table removeWrapper aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn>{t('table.columns.name')}</TableColumn>
            <TableColumn>{t('table.columns.triggerType')}</TableColumn>
            <TableColumn>{t('table.columns.configSummary')}</TableColumn>
            <TableColumn>{t('table.columns.enabled')}</TableColumn>
            <TableColumn align="end">{t('table.columns.actions')}</TableColumn>
          </TableHeader>
          <TableBody<ResourceMaintenanceSchedule>
            items={schedules}
            loadingState={tableLoadingState}
            emptyContent={<EmptyState message={t('empty')} />}
          >
            {(schedule) => (
              <TableRow key={schedule.id} id={schedule.id}>
                <TableCell>{schedule.name ?? '—'}</TableCell>
                <TableCell>{t(`triggerType.${schedule.triggerType}`)}</TableCell>
                <TableCell>{configSummary(schedule, t)}</TableCell>
                <TableCell>
                  <Switch
                    isSelected={schedule.enabled}
                    onValueChange={(enabled) => handleEnabledChange(schedule, enabled)}
                    isDisabled={isUpdating}
                    aria-label={schedule.enabled ? 'Disable' : 'Enable'}
                  />
                </TableCell>
                <TableCell align="right">
                  <MaintenanceScheduleUpsertModal resourceId={resourceId} scheduleId={schedule.id}>
                    {(open: () => void) => (
                      <Button
                        onPress={open}
                        isIconOnly
                        variant="light"
                        startContent={<PencilIcon className="w-4 h-4" />}
                        title={t('actions.edit')}
                      />
                    )}
                  </MaintenanceScheduleUpsertModal>
                  <ScheduleDeleteModal resourceId={resourceId} schedule={schedule}>
                    {(open: () => void) => (
                      <Button
                        onPress={open}
                        isIconOnly
                        variant="light"
                        color="danger"
                        startContent={<TrashIcon className="w-4 h-4" />}
                        title={t('actions.delete')}
                      />
                    )}
                  </ScheduleDeleteModal>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
