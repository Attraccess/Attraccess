import { useShellyTranslations } from '../../i18n';
import type { BleDeviceInfo } from '../../bluetooth/provisioning';

export function DeviceSummary({ info, advertisedName }: { info: BleDeviceInfo; advertisedName: string }) {
  const { t } = useShellyTranslations();
  const rows: Array<[string, string]> = [
    [t('ble.device.model'), info.model ?? advertisedName],
    [t('ble.device.generation'), info.gen ? t('devices.generation', { generation: info.gen }) : t('devices.unknown')],
    [t('ble.device.id'), info.id],
    [t('ble.device.mac'), info.mac ?? t('devices.unknown')],
    [t('ble.device.firmware'), info.ver ?? t('devices.unknown')],
  ];
  return (
    <dl className="sh:grid sh:grid-cols-[auto_1fr] sh:gap-x-4 sh:gap-y-1 sh:text-sm" data-cy="shelly-ble-device">
      {rows.map(([label, value]) => (
        <div key={label} className="sh:contents">
          <dt className="sh:text-muted">{label}</dt>
          <dd className="sh:break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
