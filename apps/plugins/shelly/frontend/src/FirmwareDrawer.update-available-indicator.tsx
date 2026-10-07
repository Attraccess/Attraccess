import { Button, Tooltip } from '@heroui/react';
import { ArrowUpCircleIcon } from 'lucide-react';
import { type FirmwareOverviewEntry } from './api';
import { useShellyTranslations } from './i18n';
import { shortVersion } from './FirmwareDrawer.short-version';

/**
 * "Update available" marker next to the device name, so the signal survives the
 * breakpoints where the Firmware column is hidden. Icon-only on purpose: a text
 * chip here widens the Device column enough to push the row actions out of the
 * table's visible width on tablets.
 */
export function UpdateAvailableIndicator({ entry }: { entry: FirmwareOverviewEntry | undefined }) {
  const { t } = useShellyTranslations();
  const version = entry?.status?.hasUpdate ? entry.status.available.stable : null;
  if (!version) return null;
  const label = t('firmware.updateAvailable', { version: shortVersion(version) });
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={label}
          className="sh:h-6 sh:w-6 sh:min-w-6 sh:text-warning"
          data-cy="shelly-update-available"
        >
          <ArrowUpCircleIcon className="sh:h-4 sh:w-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
