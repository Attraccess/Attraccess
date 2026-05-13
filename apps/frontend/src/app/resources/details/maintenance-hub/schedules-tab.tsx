import { Accordion, Button, Skeleton } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PlusIcon, CalendarClockIcon } from 'lucide-react';
import { useState } from 'react';
import {
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
  useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule,
  ResourceMaintenanceSchedule,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ScheduleAccordionItem } from './schedule-accordion-item';
import { ScheduleFormDrawer } from './schedule-form-drawer';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function SchedulesTab(props: Props) {
  const { resourceId } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } =
    useResourceMaintenanceSchedulesServiceFindMaintenanceSchedules({ resourceId });

  const [drawerScheduleId, setDrawerScheduleId] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const openCreate = () => { setDrawerScheduleId(undefined); setDrawerOpen(true); };
  const openEdit = (id: number) => { setDrawerScheduleId(id); setDrawerOpen(true); };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    );
  }

  const list = schedules ?? [];

  if (list.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <CalendarClockIcon className="w-12 h-12 text-default-400" />
          <p className="text-default-600">{t('schedules.empty')}</p>
          <Button variant="primary" onPress={openCreate}>
            <PlusIcon className="w-4 h-4" />
            {t('schedules.addFirst')}
          </Button>
        </div>
        <ScheduleFormDrawer
          resourceId={resourceId}
          scheduleId={drawerScheduleId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <Accordion>
        {list.map((schedule) => (
          <ScheduleAccordionItem
            key={schedule.id}
            schedule={schedule}
            resourceId={resourceId}
            onEdit={() => openEdit(schedule.id)}
            onDelete={() => setDeleteTarget(schedule)}
          />
        ))}
      </Accordion>

      <ScheduleFormDrawer
        resourceId={resourceId}
        scheduleId={drawerScheduleId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

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
    </>
  );
}
