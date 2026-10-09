import { useState } from 'react';
import { BUILTIN_MODBUS_PROFILES, type ModbusConnection, type ModbusDevice } from '../../../../modbus/model';
import { randomUUID } from '../../configuration/identity';
import { useWagoTranslations } from '../../i18n';
import { busConnection, deviceProfile, type PanelConfiguration } from '../model';

export function useDeviceSettingsState({
  configuration,
  device: original,
  onChange,
  onClose,
  isNew = false,
}: {
  isNew?: boolean;
  configuration: PanelConfiguration;
  device: ModbusDevice;
  onChange: (configuration: PanelConfiguration) => void;
  onClose: () => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const [device, setDevice] = useState(original);
  const [profile, setProfile] = useState(deviceProfile(configuration, original) ?? BUILTIN_MODBUS_PROFILES[0]);
  const [connection, setConnection] = useState<ModbusConnection>(
    configuration.snapshot.modbus?.connections.find((item) => item.id === original.connectionId) ??
      busConnection(configuration.snapshot),
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
    if (selected) setProfile(selected);
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
  return {
    t,
    tBackendMessage,
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
