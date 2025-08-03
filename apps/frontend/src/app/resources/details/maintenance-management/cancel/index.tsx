import { useDisclosure } from '@heroui/react';
import { DeleteConfirmationModal } from '../../../../../components/deleteConfirmationModal';
import { useFormatDateTime, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourceMaintenancesServiceCancelMaintenance,
  useResourceMaintenancesServiceFindMaintenancesKey,
  useResourceMaintenancesServiceGetMaintenance,
} from '@attraccess/react-query-client';
import { useCallback, useMemo } from 'react';

import de from './de.json';
import en from './en.json';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  resourceId: number;
  maintenanceId: number;
  children: (onOpen: () => void) => React.ReactNode;
}

export function ResourceMaintenanceCancelModal(props: Props) {
  const { resourceId, maintenanceId, children } = props;
  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const queryClient = useQueryClient();

  const { t } = useTranslations('resources.details.maintenanceManagement.cancel', {
    de,
    en,
  });

  const { data: maintenance } = useResourceMaintenancesServiceGetMaintenance({
    resourceId,
    maintenanceId,
  });

  const { mutate: cancelMaintenanceMutation, isPending: isCancelling } =
    useResourceMaintenancesServiceCancelMaintenance({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: [useResourceMaintenancesServiceFindMaintenancesKey],
        });

        onOpenChange();
      },
    });

  const onConfirm = useCallback(() => {
    cancelMaintenanceMutation({
      resourceId,
      maintenanceId,
    });
  }, [cancelMaintenanceMutation, resourceId, maintenanceId]);

  const start = useFormatDateTime(maintenance?.startTime, { showTime: true });
  const end = useFormatDateTime(maintenance?.endTime, { showTime: true });

  const itemName = useMemo(() => {
    return t('itemName', { start, end });
  }, [t, start, end]);

  return (
    <>
      {children(onOpen)}
      <DeleteConfirmationModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title={t('title')}
        onClose={onClose}
        itemName={itemName}
        isDeleting={isCancelling}
      />
    </>
  );
}
