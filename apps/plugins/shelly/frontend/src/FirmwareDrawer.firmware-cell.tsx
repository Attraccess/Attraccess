import { type FirmwareOverviewEntry } from './api';
import { useShellyTranslations } from './i18n';
import { shortVersion } from './FirmwareDrawer.short-version';

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
