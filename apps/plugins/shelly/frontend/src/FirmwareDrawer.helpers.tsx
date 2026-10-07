import type { FirmwareOverviewEntry } from './api';
import { useShellyTranslations } from './i18n';
import type { FirmwareStatus } from './api';
import { Button } from '@heroui/react';
import { Tooltip } from '@heroui/react';
import { ArrowUpCircleIcon } from 'lucide-react';
export /**
 * Gen1 reports versions as `20230913-114150/v1.14.0` — only the tail is useful
 * at a glance, the full string stays in the tooltip.
 */
function shortVersion(version: string): string {
  const tail = version.split('/').pop();
  return tail && tail.length > 0 ? tail : version;
}

/** Table cell summarising a device's firmware state from the bulk overview. */
export function FirmwareCell({ entry }: { entry: FirmwareOverviewEntry | undefined }) {
  const { t } = useShellyTranslations();
  if (!entry) {
    return <span className="sh:text-sm sh:text-default-400">{t('firmware.checking')}</span>;
  }
  if (entry.error || !entry.status) {
    return (
      <span
        className="sh:block sh:max-w-40 sh:truncate sh:text-sm sh:text-default-400"
        title={entry.error ?? undefined}
      >
        {t('firmware.unavailable')}
      </span>
    );
  }
  return (
    <div className="sh:flex sh:flex-col sh:gap-1">
      <span
        className="sh:block sh:max-w-40 sh:truncate sh:text-sm sh:text-default-700"
        title={entry.status.currentVersion ?? undefined}
      >
        {entry.status.currentVersion ? shortVersion(entry.status.currentVersion) : t('devices.unknown')}
      </span>
      {entry.status.hasUpdate && entry.status.available.stable && (
        <span className="sh:max-w-40 sh:truncate sh:text-xs sh:text-warning-600" title={entry.status.available.stable}>
          {t('firmware.available', { version: shortVersion(entry.status.available.stable) })}
        </span>
      )}
    </div>
  );
}
export function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sh:flex sh:items-baseline sh:justify-between sh:gap-3 sh:border-b sh:border-default-200 sh:py-2 sh:last:border-b-0">
      <span className="sh:text-xs sh:font-medium sh:uppercase sh:tracking-wide sh:text-default-500">{label}</span>
      <span className="sh:min-w-0 sh:truncate sh:text-sm sh:text-default-800" title={value}>
        {value}
      </span>
    </div>
  );
}

export function FirmwareDetails({ status }: { status: FirmwareStatus | null }) {
  const { t, language } = useShellyTranslations();
  if (!status) {
    return (
      <div className="sh:rounded-xl sh:border sh:border-dashed sh:border-default-300 sh:p-4 sh:text-sm sh:text-default-500">
        {t('firmware.empty')}
      </div>
    );
  }
  return (
    <section
      className="sh:rounded-xl sh:border sh:border-default-200 sh:bg-surface sh:p-4"
      data-cy="shelly-firmware-details"
    >
      <VersionRow label={t('firmware.installed')} value={status.currentVersion ?? t('devices.unknown')} />
      <VersionRow label={t('firmware.stable')} value={status.available.stable ?? t('firmware.upToDate')} />
      <VersionRow label={t('firmware.beta')} value={status.available.beta ?? t('firmware.nothingNewer')} />
      <VersionRow label={t('firmware.checked')} value={new Date(status.fetchedAt).toLocaleString(language)} />
    </section>
  );
}

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
