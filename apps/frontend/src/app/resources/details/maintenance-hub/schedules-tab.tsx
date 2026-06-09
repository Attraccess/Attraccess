import { Accordion, Skeleton } from '@heroui/react';
import { Button } from '../../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon, CalendarClockIcon } from 'lucide-react';
import { useState } from 'react';
import {
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule,
  ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ScheduleAccordionItem } from './schedule-accordion-item';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { SectionCard } from './section-card';
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

  const [deleteTarget, setDeleteTarget] = useState<ResourceMaintenanceSchedule | null>(null);

  const { mutate: deleteSchedule, isPending: isDeleting } =
    useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
        });
        setDeleteTarget(null);
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
            onEdit={() => onEdit(schedule.id)}
            onDelete={() => setDeleteTarget(schedule)}
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
      {renderBody()}

      <DeleteConfirmationModal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteSchedule({ resourceId, scheduleId: deleteTarget.id });
          }
        }}
        itemName={deleteTarget?.name ?? ''}
        isDeleting={isDeleting}
      />
    </SectionCard>
  );
}
