// Edits device links and profiles without exposing separate connection objects.
// FEATURE: WAGO front panel devices derive shared serial and TCP connections.
import { Button, Input, Label, TextField } from '@heroui/react';
import { Copy, Trash2 } from 'lucide-react';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile, type ModbusDevice } from '../../../../modbus/model';
import { randomUUID } from '../../configuration/identity';
import { Choice, NumericField } from '../../configuration/channels/DigitalChannelEditor';
import { ModbusProfileForm } from '../../configuration/modbus/ConfigurationForm';
import { removeDevice, saveDevice, type ChannelEnabledSupport, type PanelConfiguration } from '../model';
import { ReadingSettings } from './ReadingSettings';
import { SettingsDrawer } from './SettingsDrawer';
import { useDeviceSettingsState } from './useDeviceSettingsState';

export function DeviceSettings({
  configuration,
  device: original,
  onChange,
  onClose,
  isNew = false,
  support = 'unsupported',
  flowChannelIds,
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
  const {
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
    disabledReadings,
    setReadingsEnabled,
    applyRecommended,
    applyUnused,
    recommended,
    required,
    count,
    canSave,
    disabledChannels,
  } = useDeviceSettingsState({
    configuration,
    device: original,
    onChange,
    onClose,
    isNew,
    support,
    flowChannelIds,
  });

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
      <Choice
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
      <Choice
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
      {!builtin && <ModbusProfileForm value={profile} onChange={setProfile} showIdentifiers={false} collapseSignals />}
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
