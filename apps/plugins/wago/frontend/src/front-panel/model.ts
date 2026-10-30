import { DIGITAL_TERMINALS } from '../../../backend/configuration/digital';
import type { ModbusDevice, ModbusProfile } from '../../../modbus/model';
import { BUILTIN_MODBUS_PROFILES, findProfile, type ModbusConnection } from '../../../modbus/model';
import { CHANNEL_ENABLED_CAPABILITY } from '../../../shared/capabilities';
import { channelEnabled, MAX_ENABLED_CHANNELS } from '../../../shared/configuration-limits';
import { CC100_SERIAL_PATH } from '../../../shared/hardware-profile';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../api/client';
import { randomUUID } from '../configuration/identity';
import {
  addModbusChannel,
  emptyModbus,
  recommendedReadings,
  setChannelsEnabled,
  updateModbusConfiguration,
} from '../configuration/modbus/modbus-editor';

export const DEFAULT_BUS: ModbusConnection = {
  id: 'cc100-rs485',
  transport: 'rtu',
  path: CC100_SERIAL_PATH,
  baudRate: 9600,
  parity: 'even',
  stopBits: 1,
  timeoutMs: 1000,
  reconnectMs: 1000,
  queueLimit: 100,
};

export type Channel = WagoConfigurationSnapshot['logicalChannels'][number];

export interface PanelConfiguration {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
}

export type Terminal = (typeof DIGITAL_TERMINALS)[number];

/**
 * Whether the controller's runtime understands disabled channels. Controller records carry their
 * capabilities as a JSON string, diagnostics as a parsed list; anything unreadable counts as no support.
 */
export function supportsDisabledChannels(capabilities: string | readonly string[] | null | undefined): boolean {
  if (typeof capabilities === 'string')
    try {
      const parsed: unknown = JSON.parse(capabilities);
      return Array.isArray(parsed) && parsed.includes(CHANNEL_ENABLED_CAPABILITY);
    } catch {
      return false;
    }
  return Array.isArray(capabilities) && capabilities.includes(CHANNEL_ENABLED_CAPABILITY);
}

/**
 * Whether the runtime can disable channels, as far as diagnostics tell: `checking` while they load and
 * `unknown` when they failed without a previous report. Neither counts as support or as an old runtime.
 */
export type ChannelEnabledSupport = 'supported' | 'unsupported' | 'checking' | 'unknown';

export function channelEnabledSupport(diagnostics: {
  data?: { capabilities?: readonly string[] } | null;
  isError?: boolean;
}): ChannelEnabledSupport {
  if (diagnostics.data) return supportsDisabledChannels(diagnostics.data.capabilities) ? 'supported' : 'unsupported';
  return diagnostics.isError ? 'unknown' : 'checking';
}

export interface DeviceChannelOptions {
  /** The controller understands `enabled: false` (`channel-enabled-v1`); without it no channel is added disabled. */
  disabledChannels?: boolean;
  /**
   * Measurement IDs to disable on the saved device; its other readings are enabled, including registers
   * the operator just added to a custom map. Applies only with `disabledChannels`.
   */
  disabledReadings?: ReadonlySet<string>;
}

/**
 * Whether a register without a channel is added, and enabled. A new device enables the recommended set of
 * its built-in map (every register of a map without one); an existing device saved again adds its missing
 * readings disabled. Without runtime support for disabled channels, only enabled readings are added.
 */
function missingRegister(
  registerId: string,
  kind: 'measurementId' | 'actionId',
  {
    isNew,
    recommended,
    own,
    options,
  }: {
    isNew: boolean;
    recommended?: ReadonlySet<string>;
    own: boolean;
    options: DeviceChannelOptions;
  },
): { add: false } | { add: true; enabled: boolean } {
  const preferred = !recommended || recommended.has(registerId);
  if (kind === 'actionId') return { add: true, enabled: true };
  if (!options.disabledChannels) return preferred ? { add: true, enabled: true } : { add: false };
  if (own && options.disabledReadings) return { add: true, enabled: !options.disabledReadings.has(registerId) };
  return { add: true, enabled: isNew && preferred };
}

export function saveDevice(
  configuration: PanelConfiguration,
  device: ModbusDevice,
  connection: ModbusConnection,
  profile: ModbusProfile,
  options: DeviceChannelOptions = {},
): PanelConfiguration {
  const previous = configuration.snapshot.modbus ?? emptyModbus;
  const custom = !BUILTIN_MODBUS_PROFILES.some((item) => item.id === profile.id);
  const modbus = {
    ...previous,
    devices: [
      ...previous.devices.filter((item) => item.id !== device.id),
      { ...device, profileId: profile.id, profileVersion: profile.version },
    ],
    connections: [...previous.connections.filter((item) => item.id !== connection.id), connection],
    profiles: custom
      ? [...previous.profiles.filter((item) => item.id !== profile.id || item.version !== profile.version), profile]
      : previous.profiles,
  };
  let snapshot = updateModbusConfiguration(configuration.snapshot, modbus);
  const affectedDevices = modbus.devices.filter(
    (item) => item.profileId === profile.id && item.profileVersion === profile.version,
  );
  const affectedIds = new Set(affectedDevices.map((item) => item.id));
  const valid = (point: WagoConfigurationSnapshot['physicalPoints'][number]) => {
    if (!point.modbus || !affectedIds.has(point.modbus.deviceId)) return true;
    return (
      (!point.modbus.measurementId || profile.measurements.some((item) => item.id === point.modbus?.measurementId)) &&
      (!point.modbus.actionId || profile.actions.some((item) => item.id === point.modbus?.actionId))
    );
  };
  const removed = new Set(snapshot.physicalPoints.filter((point) => !valid(point)).map((point) => point.id));
  snapshot = {
    ...snapshot,
    physicalPoints: snapshot.physicalPoints.filter(valid),
    logicalChannels: snapshot.logicalChannels.filter((channel) => !removed.has(channel.physicalPointId)),
  };
  const names = { ...configuration.metadata.names };
  const recommended = recommendedReadings(profile.id);
  for (const affectedDevice of affectedDevices) {
    const isNew = !previous.devices.some((item) => item.id === affectedDevice.id);
    const own = affectedDevice.id === device.id;
    for (const [kind, registers] of [
      ['measurementId', profile.measurements],
      ['actionId', profile.actions],
    ] as const) {
      for (const register of registers) {
        const point = snapshot.physicalPoints.find(
          (point) => point.modbus?.deviceId === affectedDevice.id && point.modbus[kind] === register.id,
        );
        if (point) {
          const previousDevice = previous.devices.find((item) => item.id === affectedDevice.id);
          const previousProfile = previousDevice && findProfile(previous, previousDevice);
          const previousRegister =
            kind === 'measurementId'
              ? previousProfile?.measurements.find((item) => item.id === register.id)
              : previousProfile?.actions.find((item) => item.id === register.id);
          const channel = snapshot.logicalChannels.find((item) => item.physicalPointId === point.id);
          // Refresh generated labels, including the provisional name of a newly added device.
          // Explicit operator labels remain user data and must survive device/profile edits.
          if (
            channel &&
            previousDevice &&
            previousRegister &&
            names[channel.id] === `${previousDevice.name} · ${previousRegister.name}`.slice(0, 120)
          ) {
            names[channel.id] = `${affectedDevice.name} · ${register.name}`.slice(0, 120);
          }
          continue;
        }
        const missing = missingRegister(register.id, kind, { isNew, recommended, own, options });
        if (!missing.add) continue;
        const added = addModbusChannel(
          snapshot,
          { deviceId: affectedDevice.id, [kind]: register.id },
          { enabled: missing.enabled },
        );
        snapshot = added.snapshot;
        names[added.channel.id] = `${affectedDevice.name} · ${register.name}`.slice(0, 120);
      }
    }
  }
  if (options.disabledChannels && options.disabledReadings) {
    const readings = [...deviceReadingChannels(snapshot, device.id)];
    // A guard or feedback cannot use a disabled channel; the server refuses such a snapshot.
    const required = requiredReadings({ snapshot, metadata: { ...configuration.metadata, names } }, device.id);
    const disabledReadings = new Set([...options.disabledReadings].filter((id) => !required.has(id)));
    const choose = (disabled: boolean) =>
      new Set(readings.filter(([id]) => disabledReadings.has(id) === disabled).map(([, channel]) => channel));
    snapshot = setChannelsEnabled(setChannelsEnabled(snapshot, choose(false), true), choose(true), false);
  }
  const used = new Set(snapshot.modbus?.devices.map((device) => device.connectionId));
  if (snapshot.modbus)
    snapshot.modbus = {
      ...snapshot.modbus,
      connections: snapshot.modbus.connections.filter((item) => item.transport === 'rtu' || used.has(item.id)),
    };
  return { snapshot, metadata: { ...configuration.metadata, names } };
}

/** Measurement ID → channel ID for the readings of one device (measurement points without an action). */
export function deviceReadingChannels(snapshot: WagoConfigurationSnapshot, deviceId: string): Map<string, string> {
  const points = new Map<string, string>();
  for (const point of snapshot.physicalPoints)
    if (point.modbus?.deviceId === deviceId && point.modbus.measurementId && point.modbus.actionId === undefined)
      points.set(point.id, point.modbus.measurementId);
  const readings = new Map<string, string>();
  for (const channel of snapshot.logicalChannels) {
    const measurementId = points.get(channel.physicalPointId);
    if (measurementId && !readings.has(measurementId)) readings.set(measurementId, channel.id);
  }
  return readings;
}

/**
 * Measurement ID → names of the channels whose guard or feedback reads that reading of the device. Such
 * readings must stay enabled: a guard or feedback cannot use a disabled channel.
 */
export function requiredReadings(configuration: PanelConfiguration, deviceId: string): Map<string, string[]> {
  const { snapshot, metadata } = configuration;
  const byChannel = new Map(
    [...deviceReadingChannels(snapshot, deviceId)].map(([reading, channel]) => [channel, reading]),
  );
  const required = new Map<string, string[]>();
  for (const channel of snapshot.logicalChannels)
    for (const channelId of [channel.guard?.channelId, channel.feedback?.channelId]) {
      const reading = channelId === undefined ? undefined : byChannel.get(channelId);
      if (reading === undefined) continue;
      const users = required.get(reading) ?? [];
      const name = metadata.names[channel.id] ?? channel.id;
      if (!users.includes(name)) users.push(name);
      required.set(reading, users);
    }
  return required;
}

/**
 * Readings of the device that nothing needs: no guard or feedback uses them and no flow reads their channel
 * (`flowChannelIds`, from the controller's flow references). Disabling them all frees the most channels.
 */
export function unusedReadings(
  configuration: PanelConfiguration,
  deviceId: string,
  profile: ModbusProfile,
  flowChannelIds: ReadonlySet<string>,
): Set<string> {
  const channels = deviceReadingChannels(configuration.snapshot, deviceId);
  const required = requiredReadings(configuration, deviceId);
  return new Set(
    profile.measurements
      .map((register) => register.id)
      .filter((id) => {
        const channelId = channels.get(id);
        return !required.has(id) && !(channelId !== undefined && flowChannelIds.has(channelId));
      }),
  );
}

/**
 * The disabled readings the device settings start from: existing channels keep their state; a register
 * without a channel follows what saving does (see `missingRegister`).
 */
export function initialDisabledReadings(
  configuration: PanelConfiguration,
  deviceId: string,
  profile: ModbusProfile,
  { isNew, disabledChannels }: { isNew: boolean; disabledChannels: boolean },
): Set<string> {
  const { snapshot } = configuration;
  const readings = deviceReadingChannels(snapshot, deviceId);
  const channels = new Map(snapshot.logicalChannels.map((channel) => [channel.id, channel] as const));
  const recommended = recommendedReadings(profile.id);
  // Saving keeps readings a guard or feedback uses enabled, so they start enabled too.
  const required = requiredReadings(configuration, deviceId);
  return new Set(
    profile.measurements
      .filter((register) => {
        if (required.has(register.id)) return false;
        const channelId = readings.get(register.id);
        const channel = channelId ? channels.get(channelId) : undefined;
        if (channel) return !channelEnabled(channel);
        const preferred = !recommended || recommended.has(register.id);
        return disabledChannels ? !(isNew && preferred) : !preferred;
      })
      .map((register) => register.id),
  );
}

/** Enabled channels once the device is saved with `disabledReadings`, against the shared enabled-channel limit. */
export function enabledChannelCount(
  snapshot: WagoConfigurationSnapshot,
  deviceId: string,
  profile: ModbusProfile,
  disabledReadings: ReadonlySet<string>,
): { enabled: number; max: number } {
  const own = new Set(deviceReadingChannels(snapshot, deviceId).values());
  const others = snapshot.logicalChannels.filter((channel) => !own.has(channel.id) && channelEnabled(channel)).length;
  return {
    enabled: others + profile.measurements.filter((register) => !disabledReadings.has(register.id)).length,
    max: MAX_ENABLED_CHANNELS,
  };
}

export function terminalChannel(snapshot: WagoConfigurationSnapshot, terminal: Terminal) {
  const point = snapshot.physicalPoints.find(
    (point) => point.hardwareProfile === '751-9301' && point.channel === terminal.channel,
  );
  return snapshot.logicalChannels.find((channel) => channel.physicalPointId === point?.id);
}

export function terminalName(configuration: PanelConfiguration, terminal: Terminal) {
  const channel = terminalChannel(configuration.snapshot, terminal);
  return channel ? (configuration.metadata.names[channel.id] ?? channel.id) : '';
}

export function updateBus(configuration: PanelConfiguration, bus: ModbusConnection): PanelConfiguration {
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  return {
    ...configuration,
    snapshot: {
      ...configuration.snapshot,
      modbus: {
        ...modbus,
        connections: modbus.connections.some((connection) => connection.id === bus.id)
          ? modbus.connections.map((connection) =>
              connection.transport === 'rtu' && bus.transport === 'rtu' && connection.path === bus.path
                ? { ...bus, id: connection.id }
                : connection,
            )
          : [...modbus.connections, bus],
      },
    },
  };
}

export function busConnection(snapshot: WagoConfigurationSnapshot) {
  return snapshot.modbus?.connections.find((connection) => connection.transport === 'rtu') ?? DEFAULT_BUS;
}

export function addDevice(
  configuration: PanelConfiguration,
  name: string,
  options: Pick<DeviceChannelOptions, 'disabledChannels'> = {},
): { configuration: PanelConfiguration; id: string } {
  const profile = BUILTIN_MODBUS_PROFILES[0];
  const bus = busConnection(configuration.snapshot);
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  const used = new Set(
    modbus.devices.filter((device) => device.connectionId === bus.id).map((device) => device.unitId),
  );
  const unitId = Array.from({ length: 247 }, (_, i) => i + 1).find((id) => !used.has(id)) ?? 1;
  const device: ModbusDevice = {
    id: `device-${randomUUID()}`,
    name,
    connectionId: bus.id,
    unitId,
    profileId: profile.id,
    profileVersion: profile.version,
    pollIntervalMs: 5000,
  };
  return { configuration: saveDevice(updateBus(configuration, bus), device, bus, profile, options), id: device.id };
}

export function deviceProfile(configuration: PanelConfiguration, device: ModbusDevice) {
  return findProfile(configuration.snapshot.modbus ?? emptyModbus, device);
}

export function registerChannel(
  snapshot: WagoConfigurationSnapshot,
  deviceId: string,
  registerId: string,
  kind: 'measurementId' | 'actionId',
) {
  const point = snapshot.physicalPoints.find(
    (point) => point.modbus?.deviceId === deviceId && point.modbus[kind] === registerId,
  );
  return snapshot.logicalChannels.find((channel) => channel.physicalPointId === point?.id);
}

export function removeDevice(configuration: PanelConfiguration, deviceId: string): PanelConfiguration {
  const modbus = configuration.snapshot.modbus ?? emptyModbus;
  const points = new Set(
    configuration.snapshot.physicalPoints
      .filter((point) => point.modbus?.deviceId === deviceId)
      .map((point) => point.id),
  );
  const devices = modbus.devices.filter((device) => device.id !== deviceId);
  return {
    ...configuration,
    snapshot: {
      ...configuration.snapshot,
      physicalPoints: configuration.snapshot.physicalPoints.filter((point) => !points.has(point.id)),
      logicalChannels: configuration.snapshot.logicalChannels.filter((channel) => !points.has(channel.physicalPointId)),
      modbus: {
        ...modbus,
        devices,
        connections: modbus.connections.filter(
          (connection) =>
            connection.transport === 'rtu' || devices.some((device) => device.connectionId === connection.id),
        ),
      },
    },
  };
}

export function updateTerminal(
  configuration: PanelConfiguration,
  terminal: Terminal,
  name: string,
  settings: Partial<Channel>,
): PanelConfiguration {
  const { snapshot, metadata } = configuration;
  const existing = terminalChannel(snapshot, terminal);
  if (!name.trim()) {
    if (!existing) return configuration;
    const names = { ...metadata.names };
    delete names[existing.id];
    delete names[existing.physicalPointId];
    return {
      snapshot: {
        ...snapshot,
        logicalChannels: snapshot.logicalChannels.filter((channel) => channel.id !== existing.id),
        physicalPoints: snapshot.physicalPoints.filter((point) => point.id !== existing.physicalPointId),
      },
      metadata: { ...metadata, names },
    };
  }
  const point = { id: `point-${randomUUID()}`, hardwareProfile: '751-9301' as const, channel: terminal.channel };
  const channel: Channel = {
    ...(existing ?? {
      id: `channel-${randomUUID()}`,
      physicalPointId: point.id,
      profile: terminal.direction === 'output' ? 'generic-digital-output' : 'generic-monitored-input',
      capabilities: [terminal.direction],
      disconnectPolicy: { mode: terminal.direction === 'output' ? 'immediate' : 'hold' },
    }),
    ...settings,
  };
  if (!channel.capabilities.includes('pulse')) delete channel.pulse;
  return {
    snapshot: {
      ...snapshot,
      physicalPoints: existing ? snapshot.physicalPoints : [...snapshot.physicalPoints, point],
      logicalChannels: existing
        ? snapshot.logicalChannels.map((item) => (item.id === existing.id ? channel : item))
        : [...snapshot.logicalChannels, channel],
    },
    metadata: { ...metadata, names: { ...metadata.names, [channel.id]: name.trim() } },
  };
}
