import { useQueryClient } from '@tanstack/react-query';
import { DeleteConfirmationModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  CompanionDevice,
  UseListCompanionDevicesKeyFn,
  useDeleteCompanionDevice,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

interface CompanionDeleteDeviceModalProps {
  device: CompanionDevice | null;
  onClose: () => void;
}

export function CompanionDeleteDeviceModal({ device, onClose }: CompanionDeleteDeviceModalProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { mutate: deleteDevice, isPending: isDeleting } = useDeleteCompanionDevice(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseListCompanionDevicesKeyFn() });
      onClose();
      toast.success({ title: t('devices.delete.success') });
    },
    onError: () => {
      toast.error({ title: t('devices.delete.error') });
    },
  });

  return (
    <DeleteConfirmationModal
      isOpen={!!device}
      onClose={onClose}
      onConfirm={() => {
        if (!device) return;
        deleteDevice({ path: { id: device.id } });
      }}
      itemName={device?.name ?? ''}
      isDeleting={isDeleting}
    />
  );
}
