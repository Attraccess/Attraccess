// Edits device links and profiles without exposing separate connection objects.
// FEATURE: WAGO front panel devices derive shared serial and TCP connections.
import { Button, Input, Label, TextField } from '@heroui/react';
import { Copy, Trash2 } from 'lucide-react';
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  type ModbusConnection,
  type ModbusDevice,
} from '../../../../modbus/model';
import { useState } from 'react';
import { useWagoTranslations } from '../../i18n';
import { recommendedReadings } from '../../configuration/modbus/modbus-editor';
import { randomUUID } from '../../configuration/identity';
import { OptionSelect } from '../../configuration/channels/OptionSelect';
import { NumericField } from '../../configuration/channels/NumericField';
import { ModbusProfileForm } from '../../configuration/modbus/ModbusProfileForm';
import {
  busConnection,
  deviceProfile,
  enabledChannelCount,
  initialDisabledReadings,
  removeDevice,
  requiredReadings,
  saveDevice,
  unusedReadings,
  type ChannelEnabledSupport,
  type PanelConfiguration,
} from '../model';
import { ReadingSettings } from './ReadingSettings';
import { SettingsDrawer } from './SettingsDrawer';

export function DeviceSettings({
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
  /** Channels that flows read, kept enabled by "Disable all unused readings". */
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

  return (
    <SettingsDrawer
      title={device.name || t('panel.deviceTitle')}
      onClose={onClose}
      isSaveDisabled={!canSave}
      onSave={() => {
        if (!canSave) return;
        onChange(
          saveDevice(
            configuration,
            {
              ...device,
              name: device.name.trim(),
              connectionId: connection.id,
              pollIntervalMs: Math.round(interval * 1000),
            },
            connection,
            profile,
            { disabledChannels, disabledReadings: disabledChannels ? disabledReadings : undefined },
          ),
        );
        onClose();
      }}
      remove={
        !isNew && (
          <Button
            variant="danger-soft"
            onPress={() => {
              onChange(removeDevice(configuration, original.id));
              onClose();
            }}
          >
            <Trash2 className="wg:size-4" />
            {t('panel.removeDevice')}
          </Button>
        )
      }
    >
      <TextField isRequired>
        <Label>{t('panel.name')}</Label>
        <Input
          value={device.name}
          maxLength={120}
          onChange={(event) => setDevice({ ...device, name: event.target.value })}
        />
      </TextField>
      <OptionSelect
        label={t('panel.deviceType')}
        value={profiles.some((item) => item.id === profile.id) ? `${profile.id}@${profile.version}` : 'custom'}
        onChange={chooseProfile}
        options={[
          ...profiles.map((item) => ({
            id: `${item.id}@${item.version}`,
            label: BUILTIN_MODBUS_PROFILES.some((builtin) => builtin.id === item.id)
              ? tBackendMessage(item.name)
              : item.name,
          })),
          { id: 'custom', label: t('panel.customProfile') },
        ]}
      />
      <OptionSelect
        label={t('panel.connectedVia')}
        value={connection.transport}
        onChange={chooseTransport}
        options={[
          { id: 'rtu', label: t('panel.rs485') },
          { id: 'tcp', label: t('panel.tcp') },
        ]}
      />
      {connection.transport === 'tcp' && (
        <div className="wg:grid wg:grid-cols-1 wg:gap-4 wg:sm:grid-cols-2">
          <TextField isRequired>
            <Label>{t('modbus.host')}</Label>
            <Input
              value={connection.host}
              onChange={(event) => setConnection({ ...connection, host: event.target.value })}
            />
          </TextField>
          <NumericField
            label={t('modbus.port')}
            value={connection.port}
            min={1}
            max={65535}
            onChange={(port) => setConnection({ ...connection, port })}
          />
        </div>
      )}
      <div className="wg:grid wg:grid-cols-1 wg:gap-4 wg:sm:grid-cols-2">
        <NumericField
          label={t(connection.transport === 'rtu' ? 'panel.address' : 'panel.unitId')}
          value={device.unitId}
          min={1}
          max={247}
          onChange={(unitId) => setDevice({ ...device, unitId })}
        />
        <NumericField
          label={t('panel.pollInterval')}
          value={interval}
          min={0.1}
          max={3600}
          integer={false}
          onChange={setInterval}
        />
      </div>
      <div className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-2">
        <h3 className="wg:font-semibold">{t(builtin ? 'panel.builtinRegisters' : 'panel.customRegisters')}</h3>
        {builtin && (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setProfile(duplicateProfile(profile, `profile-${randomUUID()}`))}
          >
            <Copy className="wg:size-4" />
            {t('panel.customize')}
          </Button>
        )}
      </div>
      {!builtin && <ModbusProfileForm value={profile} onChange={setProfile} />}
      {profile.measurements.length > 0 && (
        <ReadingSettings
          profile={profile}
          translateNames={builtin}
          disabledReadings={disabledReadings}
          recommended={recommended}
          required={required}
          count={count}
          support={support}
          onChange={setReadingsEnabled}
          onRecommended={applyRecommended}
          onUnused={applyUnused}
        />
      )}
    </SettingsDrawer>
  );
}
