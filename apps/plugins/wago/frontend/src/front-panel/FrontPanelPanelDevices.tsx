import { DeviceCard } from './Cards';
import { useFrontPanelState } from './useFrontPanelState';
type Props = Pick<ReturnType<typeof useFrontPanelState>, 't' | 'panel' | 'setSelection'>;
export function FrontPanelPanelDevices({ t, panel, setSelection }: Props) {
  return (
    <section
      aria-label={t('panel.devices')}
      className="wg:grid wg:grid-cols-1 wg:gap-4 wg:md:grid-cols-2 wg:xl:grid-cols-3"
    >
      {panel.configuration.snapshot.modbus?.devices.map((device) => (
        <DeviceCard
          key={device.id}
          configuration={
            panel.configuration ?? {
              snapshot: { version: 1, physicalPoints: [], logicalChannels: [] },
              metadata: { names: {}, presets: [] },
            }
          }
          device={device}
          live={panel.live}
          disabled={panel.busy || panel.pending}
          onEdit={() => setSelection({ kind: 'device', id: device.id })}
        />
      ))}
    </section>
  );
}
