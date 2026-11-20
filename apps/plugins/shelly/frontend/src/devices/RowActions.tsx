import { TableRowActions } from '@attraccess/plugins-frontend-ui';
import { CpuIcon, InfoIcon, KeyRoundIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import type { ShellyDevice } from '../api';
import { useShellyTranslations } from '../i18n';

export function RowActions({
  device,
  isBusy,
  onInfo,
  onFirmware,
  onAuth,
  onReprobe,
  onDelete,
}: {
  device: Pick<ShellyDevice, 'id' | 'name' | 'ipAddress'>;
  isBusy: boolean;
  onInfo: () => void;
  onFirmware: () => void;
  onAuth: () => void;
  onReprobe: () => void;
  onDelete: () => Promise<unknown>;
}) {
  const { t } = useShellyTranslations();
  const deviceId = device.id;
  return (
    <TableRowActions
      itemName={device.name}
      isPending={isBusy}
      data-cy={`shelly-device-menu-${deviceId}`}
      actions={[
        {
          key: 'info',
          label: t('devices.info'),
          icon: InfoIcon,
          onPress: onInfo,
          'data-cy': `shelly-device-info-${deviceId}`,
        },
        {
          key: 'firmware',
          label: t('devices.manageFirmware'),
          icon: CpuIcon,
          onPress: onFirmware,
          'data-cy': `shelly-device-firmware-${deviceId}`,
        },
        {
          key: 'auth',
          label: t('devices.password'),
          icon: KeyRoundIcon,
          onPress: onAuth,
          'data-cy': `shelly-device-auth-${deviceId}`,
        },
        {
          key: 'reprobe',
          label: t('devices.reprobe'),
          icon: RefreshCwIcon,
          onPress: onReprobe,
          'data-cy': `shelly-device-reprobe-${deviceId}`,
        },
        {
          key: 'delete',
          label: t('devices.delete'),
          icon: Trash2Icon,
          tone: 'danger',
          onPress: onDelete,
          'data-cy': `shelly-device-delete-${deviceId}`,
          confirm: {
            title: t('devices.delete'),
            message: t('devices.deleteDescription', { name: device.name, address: device.ipAddress }),
            confirmLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            'data-cy': 'shelly-delete-confirmation-modal',
            confirmDataCy: 'shelly-delete-confirm',
            cancelDataCy: 'shelly-delete-cancel',
          },
        },
      ]}
    />
  );
}
