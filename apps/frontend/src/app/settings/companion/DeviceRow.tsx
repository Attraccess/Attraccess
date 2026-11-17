import { Chip, TableCell, TableRow } from '@heroui/react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { ReactNode } from 'react';
import { lt, valid } from 'semver';
import { Button, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { CompanionDevice, useCompanionDevicesServiceGetCompanionDevice } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

interface DeviceRowProps {
  device: CompanionDevice;
  latestVersion: string | null;
  onRenameStart: (device: CompanionDevice) => void;
  onDeleteStart: (device: CompanionDevice) => void;
}

type DeviceWithConnected = CompanionDevice & { connected?: boolean };

function isOutdated(deviceVersion: string, latestVersion: string): boolean {
  if (!valid(deviceVersion) || !valid(latestVersion)) return false;
  return lt(deviceVersion, latestVersion);
}

export function DeviceRow({ device, latestVersion, onRenameStart, onDeleteStart }: DeviceRowProps) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter();
  const { data } = useCompanionDevicesServiceGetCompanionDevice({ id: device.id }, undefined, {
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
        <div className="flex flex-row gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onPress={() => onRenameStart(device)}>
            <PencilIcon className="w-4 h-4" />
            {t('devices.actions.rename')}
          </Button>
          <Button variant="danger-soft" size="sm" onPress={() => onDeleteStart(device)}>
            <Trash2Icon className="w-4 h-4" />
            {t('devices.actions.delete')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
