import { Button } from '@attraccess/plugins-frontend-ui';
import { Chip, Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger, Tooltip } from '@heroui/react';
import {
  CpuIcon,
  InfoIcon,
  KeyRoundIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { AuthState } from '../api';
import { useShellyTranslations } from '../i18n';

export function AuthChip({ state }: { state: AuthState }) {
  const { t } = useShellyTranslations();
  const map = {
    none: { color: 'success' as const },
    required: { color: 'warning' as const },
    unknown: { color: 'default' as const },
  };
  const { color } = map[state];
  return (
    <Chip variant="soft" color={color} size="sm" className="sh:whitespace-nowrap">
      {t(`auth.${state}`)}
    </Chip>
  );
}

export function ProbeErrorIndicator({ message }: { message: string }) {
  const { t } = useShellyTranslations();
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t('devices.probeError', { message })}
          className="sh:h-6 sh:w-6 sh:min-w-6 sh:text-warning"
          data-cy="shelly-device-probe-error"
        >
          <TriangleAlertIcon className="sh:h-4 sh:w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{t('devices.probeError', { message })}</Tooltip.Content>
    </Tooltip>
  );
}

export function RowActions({
  deviceId,
  isBusy,
  onInfo,
  onFirmware,
  onAuth,
  onReprobe,
  onDelete,
}: {
  deviceId: number;
  isBusy: boolean;
  onInfo: () => void;
  onFirmware: () => void;
  onAuth: () => void;
  onReprobe: () => void;
  onDelete: () => void;
}) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-row sh:items-center sh:justify-end sh:gap-1 sh:whitespace-nowrap">
      <Tooltip>
        <Tooltip.Trigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t('devices.info')}
            isDisabled={isBusy}
            onPress={onInfo}
            data-cy={`shelly-device-info-${deviceId}`}
          >
            <InfoIcon className="sh:h-4 sh:w-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{t('devices.info')}</Tooltip.Content>
      </Tooltip>
      <Dropdown>
        <DropdownTrigger>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label={t('devices.more')}
            isPending={isBusy}
            data-cy={`shelly-device-menu-${deviceId}`}
          >
            <MoreVerticalIcon className="sh:h-4 sh:w-4" />
          </Button>
        </DropdownTrigger>
        <DropdownPopover>
          <DropdownMenu aria-label={t('devices.deviceActions')}>
            <DropdownItem id="firmware" onPress={onFirmware} data-cy={`shelly-device-firmware-${deviceId}`}>
              <CpuIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.manageFirmware')}
            </DropdownItem>
            <DropdownItem id="auth" onPress={onAuth} data-cy={`shelly-device-auth-${deviceId}`}>
              <KeyRoundIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.password')}
            </DropdownItem>
            <DropdownItem id="reprobe" onPress={onReprobe} data-cy={`shelly-device-reprobe-${deviceId}`}>
              <RefreshCwIcon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.reprobe')}
            </DropdownItem>
            <DropdownItem
              id="delete"
              onPress={onDelete}
              className="sh:text-danger"
              data-cy={`shelly-device-delete-${deviceId}`}
            >
              <Trash2Icon className="sh:mr-2 sh:inline sh:h-4 sh:w-4" /> {t('devices.delete')}
            </DropdownItem>
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
    </div>
  );
}
