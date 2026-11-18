import { Accordion, Skeleton } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon, CalendarClockIcon } from 'lucide-react';
import {
  useFindMaintenanceSchedulesKey,
  useDeleteMaintenanceSchedule,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleTriggerType,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ScheduleAccordionItem } from './schedule-accordion-item';
import { SectionCard } from './section-card';
import { OperatingTrackingNotice, useOperatingTrackingReadiness } from '../operating-readiness';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
  schedules: ResourceMaintenanceSchedule[];
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (id: number) => void;
}

export function SchedulesTab(props: Props) {
  const { resourceId, schedules, isLoading, onCreate, onEdit } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();
  const hasOperatingSchedule = schedules.some(
    (schedule) =>
      schedule.triggerType === ResourceMaintenanceScheduleTriggerType.USAGE_HOURS &&
      (schedule as { durationBasis?: string }).durationBasis === 'ATTRIBUTABLE_OPERATING_DURATION',
  );
  const trackingReadiness = useOperatingTrackingReadiness(resourceId, hasOperatingSchedule);

  const { mutateAsync: deleteSchedule } = useDeleteMaintenanceSchedule(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useFindMaintenanceSchedulesKey],
      });
    },
  });

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
      );
    }

    if (schedules.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
          <CalendarClockIcon className="w-12 h-12 text-default-400" />
          <p className="text-default-600">{t('schedules.empty')}</p>
          <Button variant="primary" onPress={onCreate}>
            <PlusIcon className="w-4 h-4" />
            {t('schedules.addFirst')}
          </Button>
        </div>
      );
    }

    return (
      <Accordion>
        {schedules.map((schedule) => (
          <ScheduleAccordionItem
            key={schedule.id}
            schedule={schedule}
            resourceId={resourceId}
            trackingReadiness={trackingReadiness}
            onEdit={() => onEdit(schedule.id)}
            onDelete={() => deleteSchedule({ path: { resourceId, scheduleId: schedule.id } })}
          />
        ))}
      </Accordion>
    );
  };

  return (
    <SectionCard
      icon={<CalendarClockIcon className="w-4 h-4 text-default-500" />}
      title={t('tabs.schedules')}
      count={schedules.length}
    >
      {hasOperatingSchedule && (
        <OperatingTrackingNotice resourceId={resourceId} readiness={trackingReadiness} schedule />
      )}
      {renderBody()}
    </SectionCard>
  );
}
