import type { PanelConfiguration } from '../model';
import { useWagoTranslations } from '../../i18n';
import type { FrontPanelWorkingCopy } from '../working-copy/useFrontPanel';
import { DeviceCard } from './Cards';

interface FrontPanelDevicesProps {
  configuration: PanelConfiguration;
  panel: Pick<FrontPanelWorkingCopy, 'live' | 'busy' | 'pending'>;
  onEditDevice: (deviceId: string) => void;
}

export function FrontPanelDevices({ configuration, panel, onEditDevice }: FrontPanelDevicesProps) {
  const { t } = useWagoTranslations();
  return (
    <section
      aria-label={t('panel.devices')}
      className="wg:grid wg:grid-cols-1 wg:gap-4 wg:md:grid-cols-2 wg:xl:grid-cols-3"
    >
      {configuration.snapshot.modbus?.devices.map((device) => (
        <DeviceCard
          key={device.id}
          configuration={configuration}
          device={device}
          live={panel.live}
          disabled={panel.busy || panel.pending}
          onEdit={() => onEditDevice(device.id)}
        />
      ))}
    </section>
  );
}
