import { useState } from 'react';
import { BUILTIN_MODBUS_PROFILES, type ModbusConnection, type ModbusDevice } from '../../../../modbus/model';
import { randomUUID } from '../../configuration/identity';
import { useWagoTranslations } from '../../i18n';
import { recommendedReadings } from '../../configuration/modbus/modbus-editor';
import {
  busConnection,
  deviceProfile,
  enabledChannelCount,
  initialDisabledReadings,
  requiredReadings,
  unusedReadings,
  type ChannelEnabledSupport,
  type PanelConfiguration,
} from '../model';

export function useDeviceSettingsState({
  configuration,
  device: original,
  onChange,
  onClose,
  isNew = false,
  support = 'unsupported',
  flowChannelIds = new Set(),
}: {
  isNew?: boolean;
  /** Whether the controller's runtime supports disabled channels (`channel-enabled-v1`). */
  support?: ChannelEnabledSupport;
  /** Channels that flows read, from the controller's flow references. */
  flowChannelIds?: ReadonlySet<string>;
  configuration: PanelConfiguration;
  device: ModbusDevice;
  onChange: (configuration: PanelConfiguration) => void;
  onClose: () => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const disabledChannels = support === 'supported';
  const [device, setDevice] = useState(original);
  const [profile, setProfile] = useState(deviceProfile(configuration, original) ?? BUILTIN_MODBUS_PROFILES[0]);
  const [connection, setConnection] = useState<ModbusConnection>(
    configuration.snapshot.modbus?.connections.find((item) => item.id === original.connectionId) ??
      busConnection(configuration.snapshot),
  );
  const [disabledReadings, setDisabledReadings] = useState(() =>
    initialDisabledReadings(configuration, original.id, profile, { isNew, disabledChannels }),
  );
  const [interval, setInterval] = useState(
    (device.pollIntervalMs ?? profile.measurements[0]?.pollIntervalMs ?? 5000) / 1000,
  );
  const builtin = BUILTIN_MODBUS_PROFILES.some((item) => item.id === profile.id);
  const profiles = [...BUILTIN_MODBUS_PROFILES, ...(configuration.snapshot.modbus?.profiles ?? [])];
  const chooseProfile = (key: string) => {
    if (key === 'custom') {
      setProfile({
        id: `profile-${randomUUID()}`,
        name: t('panel.customProfile'),
        version: 1,
        measurements: [],
        actions: [],
      });
      return;
    }
    const selected = profiles.find((item) => `${item.id}@${item.version}` === key);
    if (!selected) return;
    setProfile(selected);
    setDisabledReadings(initialDisabledReadings(configuration, original.id, selected, { isNew, disabledChannels }));
  };
  const chooseTransport = (transport: string) =>
    setConnection(
      transport === 'rtu'
        ? busConnection(configuration.snapshot)
        : {
            id: `connection-${randomUUID()}`,
            transport: 'tcp',
            host: '',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 1000,
            queueLimit: 100,
          },
    );
  const recommended = recommendedReadings(profile.id);
  const count = enabledChannelCount(configuration.snapshot, original.id, profile, disabledReadings);
  // Readings a guard or feedback uses stay enabled; switches and bulk actions skip them.
  const required = requiredReadings(configuration, original.id);
  const setReadingsEnabled = (ids: readonly string[], enabled: boolean) =>
    setDisabledReadings((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (enabled) next.delete(id);
        else if (!required.has(id)) next.add(id);
      }
      return next;
    });
  const applyRecommended = () => {
    if (recommended)
      setDisabledReadings(
        new Set(profile.measurements.map((item) => item.id).filter((id) => !recommended.has(id) && !required.has(id))),
      );
  };
  /** Disables every reading no guard, feedback or flow needs; the others are enabled. */
  const applyUnused = () => setDisabledReadings(unusedReadings(configuration, original.id, profile, flowChannelIds));
  /** Without runtime support nothing can be disabled, so a configuration over the limit cannot be saved. */
  const overLimit = count.enabled > count.max;
  const canSave = !(overLimit && support === 'unsupported');
  return {
    t,
    tBackendMessage,
    disabledReadings,
    setReadingsEnabled,
    applyRecommended,
    applyUnused,
    recommended,
    required,
    count,
    canSave,
    support,
    disabledChannels,
    device,
    setDevice,
    profile,
    setProfile,
    connection,
    setConnection,
    interval,
    setInterval,
    builtin,
    profiles,
    chooseProfile,
    chooseTransport,
    configuration,
    original,
    onChange,
    onClose,
    isNew,
  };
}
