import { ReactNode } from 'react';
import { Chip } from '@heroui/react';
import { TableCell } from '@heroui/react';
import { TableRow } from '@heroui/react';
import { PencilIcon } from 'lucide-react';
import { Trash2Icon } from 'lucide-react';
import { useCompanionDevicesServiceGetCompanionDevice } from '@attraccess/react-query-client';
import { Button } from '../../../components/button';
import type { DeviceRowProps } from './index.contracts';
import type { DeviceWithConnected } from './index.contracts';
import { lt } from 'semver';
import { valid } from 'semver';

export function isOutdated(deviceVersion: string, latestVersion: string): boolean {
  if (!valid(deviceVersion) || !valid(latestVersion)) return false;
  return lt(deviceVersion, latestVersion);
}

export function DeviceRow({ device, latestVersion, onRenameStart, onDeleteStart, t, formatDateTime }: DeviceRowProps) {
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
export function platformLabel(platform: string, arch: string): string {
  if (platform === 'win32' || platform === 'windows') return 'Windows x64';
  if (platform === 'darwin' || platform === 'macos') return 'macOS (Universal)';
  if (platform === 'linux' && arch === 'arm64') return 'Linux arm64';
  if (platform === 'linux') return 'Linux x64';
  return `${platform} ${arch}`;
}
