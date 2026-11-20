import { EmptyState, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import type { FirmwareStatus } from '../../api';
import { useShellyTranslations } from '../../i18n';

function VersionRow({ label, value }: { label: string; value: string }) {
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
  const { t } = useShellyTranslations();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  if (!status) {
    return <EmptyState message={t('firmware.empty')} />;
  }
  return (
    <section
      className="sh:rounded-xl sh:border sh:border-default-200 sh:bg-surface sh:p-4"
      data-cy="shelly-firmware-details"
    >
      <VersionRow label={t('firmware.installed')} value={status.currentVersion ?? t('devices.unknown')} />
      <VersionRow label={t('firmware.stable')} value={status.available.stable ?? t('firmware.upToDate')} />
      <VersionRow label={t('firmware.beta')} value={status.available.beta ?? t('firmware.nothingNewer')} />
      <VersionRow label={t('firmware.checked')} value={String(formatDateTime(status.fetchedAt))} />
    </section>
  );
}
