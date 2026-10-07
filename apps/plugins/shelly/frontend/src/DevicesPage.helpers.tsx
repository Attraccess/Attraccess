import { Chip } from '@heroui/react';
import type { AuthState } from './api';
import { useShellyTranslations } from './i18n';
import { Button } from '@heroui/react';
import { MehIcon } from 'lucide-react';
import { PlusIcon } from 'lucide-react';
import { Tooltip } from '@heroui/react';
import { TriangleAlertIcon } from 'lucide-react';
import { Dropdown } from '@heroui/react';
import { DropdownItem } from '@heroui/react';
import { DropdownMenu } from '@heroui/react';
import { DropdownPopover } from '@heroui/react';
import { DropdownTrigger } from '@heroui/react';
import { CpuIcon } from 'lucide-react';
import { InfoIcon } from 'lucide-react';
import { KeyRoundIcon } from 'lucide-react';
import { MoreVerticalIcon } from 'lucide-react';
import { RefreshCwIcon } from 'lucide-react';
import { Trash2Icon } from 'lucide-react';

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

export function EmptyDevices({ onAdd }: { onAdd: () => void }) {
  const { t } = useShellyTranslations();
  return (
    <div className="sh:flex sh:flex-col sh:items-center sh:justify-center sh:gap-3 sh:px-4 sh:py-12">
      <MehIcon size={36} className="sh:text-default-300" />
      <p className="sh:text-sm sh:text-default-500">{t('devices.empty')}</p>
      <Button variant="secondary" size="sm" onPress={onAdd} data-cy="shelly-add-open-empty">
        <PlusIcon className="sh:h-4 sh:w-4" /> {t('devices.add')}
      </Button>
    </div>
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
