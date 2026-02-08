import { useDisclosure } from '@heroui/react';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import {
  useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule,
  useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey,
} from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ResourceMaintenanceSchedule } from '@attraccess/react-query-client';

interface Props {
  resourceId: number;
  schedule: ResourceMaintenanceSchedule;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ScheduleDeleteModal(props: Props) {
  const { resourceId, schedule, children } = props;
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const queryClient = useQueryClient();


  const { mutate: deleteSchedule, isPending: isDeleting } =
    useResourceMaintenanceSchedulesServiceDeleteMaintenanceSchedule({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenanceSchedulesServiceFindMaintenanceSchedulesKey],
        });
        onClose();
      },
    });

  const onConfirm = useCallback(() => {
    deleteSchedule({ resourceId, scheduleId: schedule.id });
  }, [deleteSchedule, resourceId, schedule.id]);

  const itemName = schedule.name || `#${schedule.id}`;

  return (
    <>
      {children(onOpen)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        onClose={onClose}
        itemName={itemName}
        isDeleting={isDeleting}
      />
    </>
  );
}
