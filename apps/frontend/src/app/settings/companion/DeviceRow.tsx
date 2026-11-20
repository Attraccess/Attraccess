import { Chip, TableCell, TableRow } from '@heroui/react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { ReactNode } from 'react';
import { lt, valid } from 'semver';
import { useQueryClient } from '@tanstack/react-query';
import {
  I18nTransComponent,
  TableRowActions,
  useDateTimeFormatter,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  CompanionDevice,
  UseListCompanionDevicesKeyFn,
  useDeleteCompanionDevice,
  useGetCompanionDevice,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

interface DeviceRowProps {
  device: CompanionDevice;
  latestVersion: string | null;
  onRenameStart: (device: CompanionDevice) => void;
}

type DeviceWithConnected = CompanionDevice & { connected?: boolean };

function isOutdated(deviceVersion: string, latestVersion: string): boolean {
  if (!valid(deviceVersion) || !valid(latestVersion)) return false;
  return lt(deviceVersion, latestVersion);
}

export function DeviceRow({ device, latestVersion, onRenameStart }: DeviceRowProps) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { mutateAsync: deleteDevice } = useDeleteCompanionDevice(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UseListCompanionDevicesKeyFn() });
      toast.success({ title: t('devices.delete.success') });
    },
    onError: () => {
      toast.error({ title: t('devices.delete.error') });
    },
  });
  const { data } = useGetCompanionDevice({ path: { id: device.id } }, undefined, {
    refetchInterval: 30000,
  });
  const fetchedDevice = data as DeviceWithConnected | undefined;
  const isOnline = fetchedDevice?.connected ?? false;
  const appVersion = fetchedDevice?.appVersion ?? device.appVersion ?? null;
  const showUpdateBadge = appVersion !== null && latestVersion !== null && isOutdated(appVersion, latestVersion);

  return (
    <TableRow key={device.id} id={device.id}>
      <TableCell>{device.name}</TableCell>
      <TableCell>
        <Chip color={isOnline ? 'success' : 'default'} size="sm">
          {isOnline ? t('devices.status.online') : t('devices.status.offline')}
        </Chip>
      </TableCell>
      <TableCell className="whitespace-nowrap">{formatDateTime(device.lastConnection) as ReactNode}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="text-sm">{appVersion ?? '—'}</span>
          {showUpdateBadge && (
            <Chip color="warning" size="sm">
              {t('updateAvailable')}
            </Chip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <TableRowActions
          itemName={device.name}
          actions={[
            {
              key: 'rename',
              label: t('devices.actions.rename'),
              icon: PencilIcon,
              onPress: () => onRenameStart(device),
            },
            {
              key: 'delete',
              label: t('devices.actions.delete'),
              icon: Trash2Icon,
              tone: 'danger',
              onPress: () => deleteDevice({ path: { id: device.id } }),
              confirm: {
                title: t('deleteConfirm.title'),
                message: (
                  <p>
                    <I18nTransComponent
                      t={t}
                      i18nKey="deleteConfirm.message"
                      values={{ name: device.name }}
                      components={{ bold: <strong /> }}
                    />
                  </p>
                ),
                confirmLabel: t('deleteConfirm.confirm'),
                cancelLabel: t('deleteConfirm.cancel'),
              },
            },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
