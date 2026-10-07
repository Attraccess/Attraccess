import { type FirmwareStatus } from './api';
import { useShellyTranslations } from './i18n';
import { VersionRow } from './FirmwareDrawer.version-row';

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
