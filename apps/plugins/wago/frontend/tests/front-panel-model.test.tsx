// Verifies terminal identities and device bindings across front panel edits.
// FEATURE: WAGO front panel configuration preserves routing and profile contracts.
import { describe, expect, it } from 'vitest';
import { DIGITAL_TERMINALS } from '../../backend/configuration/digital';
import { validateEditorModel, validateEditorSnapshot } from '../../backend/configuration/editor';
import { validateEnabled, type ConfigurationValidationError } from '../../backend/configuration/model';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import { WAGO_879_3020_DEFAULT_ENABLED } from '../../modbus/wago-879-3020';
import { CHANNEL_ENABLED_CAPABILITY } from '../../shared/capabilities';
import { CONFIGURATION_LIMIT_MESSAGES, MAX_ENABLED_CHANNELS } from '../../shared/configuration-limits';
import { bindModbusPoint, canDisableChannel } from '../src/configuration/modbus/modbus-editor';
import {
  addDevice,
  busConnection,
  channelEnabledSupport,
  requiredReadings,
  unusedReadings,
  deviceReadingChannels,
  enabledChannelCount,
  initialDisabledReadings,
  removeDevice,
  saveDevice,
  supportsDisabledChannels,
  terminalChannel,
  updateBus,
  updateTerminal,
  type PanelConfiguration,
} from '../src/front-panel/model';

const empty = (): PanelConfiguration => ({
  snapshot: { version: 1, physicalPoints: [], logicalChannels: [] },
  metadata: { names: {}, presets: [] },
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing test fixture value');
  return value;
}

const meterProfile = BUILTIN_MODBUS_PROFILES[0];
const supported = { disabledChannels: true } as const;

/** Enabled and disabled measurement IDs of one device. */
function readings(configuration: PanelConfiguration, deviceId: string) {
  const channels = new Map(configuration.snapshot.logicalChannels.map((channel) => [channel.id, channel] as const));
  const enabled: string[] = [];
  const disabled: string[] = [];
  for (const [measurementId, channelId] of deviceReadingChannels(configuration.snapshot, deviceId))
    (channels.get(channelId)?.enabled === false ? disabled : enabled).push(measurementId);
  return { enabled: enabled.sort(), disabled: disabled.sort() };
}

describe('front panel configuration', () => {
  it('refreshes provisional device labels while preserving customized and unrelated channel names', () => {
    let configuration = addDevice(empty(), 'Existing meter').configuration;
    const existingNames = { ...configuration.metadata.names };
    const added = addDevice(configuration, 'New Modbus device');
    configuration = added.configuration;
    const device = required(configuration.snapshot.modbus).devices.find((item) => item.id === added.id);
    const profile = BUILTIN_MODBUS_PROFILES[0];
    const points = configuration.snapshot.physicalPoints.filter((point) => point.modbus?.deviceId === added.id);
    const customized = required(
      configuration.snapshot.logicalChannels.find((channel) => channel.physicalPointId === points[0].id),
    );
    configuration.metadata.names[customized.id] = 'Operator custom label';
    const next = saveDevice(
      configuration,
      { ...required(device), name: 'Workshop meter' },
      busConnection(configuration.snapshot),
      profile,
    );
    expect(next.snapshot.logicalChannels).toEqual(configuration.snapshot.logicalChannels);
    for (const point of points) {
      const channel = required(next.snapshot.logicalChannels.find((item) => item.physicalPointId === point.id));
      const register = required(profile.measurements.find((item) => item.id === point.modbus?.measurementId));
      expect(next.metadata.names[channel.id]).toBe(
        channel.id === customized.id ? 'Operator custom label' : `Workshop meter · ${register.name}`.slice(0, 120),
      );
    }
    for (const [id, name] of Object.entries(existingNames)) expect(next.metadata.names[id]).toBe(name);
    expect(validateEditorModel(next.snapshot)).toEqual([]);
  });

  it('preserves measurement calibration on both edited and unrelated devices', () => {
    let configuration = addDevice(empty(), 'First meter').configuration;
    configuration = addDevice(configuration, 'Second meter').configuration;
    configuration.snapshot.logicalChannels = configuration.snapshot.logicalChannels.map((channel) => ({
      ...channel,
      measurement: { ...required(channel.measurement), scale: 1.25, offset: -3 },
    }));
    const device = required(configuration.snapshot.modbus).devices[0];
    const next = saveDevice(
      configuration,
      { ...device, name: 'Renamed', pollIntervalMs: 2500 },
      busConnection(configuration.snapshot),
      BUILTIN_MODBUS_PROFILES[0],
    );
    expect(next.snapshot.logicalChannels.map((channel) => channel.measurement)).toEqual(
      configuration.snapshot.logicalChannels.map((channel) => channel.measurement),
    );
  });
  it('uses each fixed terminal and preserves the channel identity when renaming', () => {
    let configuration = empty();
    for (const terminal of DIGITAL_TERMINALS)
      configuration = updateTerminal(configuration, terminal, terminal.label, {});
    expect(configuration.snapshot.logicalChannels).toHaveLength(12);
    expect(validateEditorModel(configuration.snapshot)).toEqual([]);
    const before = required(terminalChannel(configuration.snapshot, DIGITAL_TERMINALS[0]));
    configuration = updateTerminal(configuration, DIGITAL_TERMINALS[0], 'Laser power', {});
    expect(terminalChannel(configuration.snapshot, DIGITAL_TERMINALS[0])?.id).toBe(before.id);
    expect(terminalChannel(configuration.snapshot, DIGITAL_TERMINALS[0])?.physicalPointId).toBe(before.physicalPointId);
    expect(configuration.metadata.names[before.id]).toBe('Laser power');
  });

  it('removes an unnamed terminal and clears pulse settings when changing to switched behavior', () => {
    let configuration = updateTerminal(empty(), DIGITAL_TERMINALS[0], 'Door', {
      capabilities: ['output', 'pulse'],
      pulse: { durationMs: 3000 },
    });
    configuration = updateTerminal(configuration, DIGITAL_TERMINALS[0], 'Door', { capabilities: ['output'] });
    expect(configuration.snapshot.logicalChannels[0].pulse).toBeUndefined();
    configuration = updateTerminal(configuration, DIGITAL_TERMINALS[0], '  ', {});
    expect(configuration.snapshot.physicalPoints).toEqual([]);
    expect(configuration.snapshot.logicalChannels).toEqual([]);
    expect(configuration.metadata.names).toEqual({});
  });

  it('keeps the recommended set inside the built-in 879-3020 map', () => {
    expect(meterProfile.id).toBe('wago-879-3020');
    expect(meterProfile.measurements).toHaveLength(131);
    expect(WAGO_879_3020_DEFAULT_ENABLED).toHaveLength(11);
    for (const id of WAGO_879_3020_DEFAULT_ENABLED)
      expect(meterProfile.measurements.map((register) => register.id)).toContain(id);
    expect(JSON.stringify(duplicateProfile(meterProfile, 'copy'))).not.toContain('enabled');
  });

  it('adds a new meter with every register but only the recommended readings enabled', () => {
    const { configuration, id } = addDevice(empty(), 'Laser meter', supported);
    expect(configuration.snapshot.physicalPoints).toHaveLength(131);
    expect(configuration.snapshot.logicalChannels).toHaveLength(131);
    const { enabled, disabled } = readings(configuration, id);
    expect(enabled).toEqual([...WAGO_879_3020_DEFAULT_ENABLED].sort());
    expect(disabled).toHaveLength(120);
    // `true` is never stored: an enabled channel omits the field.
    expect(configuration.snapshot.logicalChannels.filter((channel) => 'enabled' in channel)).toHaveLength(120);
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
  });

  it('publishes ten built-in 879-3020 meters cleanly with eleven readings enabled on each', () => {
    let configuration = empty();
    for (let index = 0; index < 10; index++)
      configuration = addDevice(configuration, `Meter ${index + 1}`, supported).configuration;
    expect(configuration.snapshot.modbus?.devices.map((device) => device.unitId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(configuration.snapshot.logicalChannels).toHaveLength(1310);
    expect(configuration.snapshot.logicalChannels.filter((channel) => channel.enabled !== false)).toHaveLength(110);
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
  });

  it('refuses to publish two built-in 879-3020 meters with every reading enabled', () => {
    let configuration = addDevice(empty(), 'Laser meter', supported).configuration;
    configuration = addDevice(configuration, 'CNC meter', supported).configuration;
    for (const device of required(configuration.snapshot.modbus).devices)
      configuration = saveDevice(configuration, device, busConnection(configuration.snapshot), meterProfile, {
        ...supported,
        disabledReadings: new Set(),
      });
    expect(configuration.snapshot.logicalChannels.filter((channel) => channel.enabled !== false)).toHaveLength(262);
    expect(validateEditorSnapshot(configuration.snapshot).map((error) => error.message)).toEqual([
      CONFIGURATION_LIMIT_MESSAGES.enabledChannels,
    ]);
  });

  it('adds only the recommended readings when the controller cannot disable channels', () => {
    const { configuration, id } = addDevice(empty(), 'Laser meter');
    expect(configuration.snapshot.logicalChannels).toHaveLength(11);
    expect(readings(configuration, id)).toEqual({ enabled: [...WAGO_879_3020_DEFAULT_ENABLED].sort(), disabled: [] });
    const device = required(configuration.snapshot.modbus?.devices[0]);
    const resaved = saveDevice(configuration, device, busConnection(configuration.snapshot), meterProfile, {
      disabledReadings: new Set(['active-power']),
    });
    expect(resaved.snapshot.logicalChannels).toEqual(configuration.snapshot.logicalChannels);
  });

  it('adds the missing registers of an existing meter as disabled when it is saved again', () => {
    const { configuration, id } = addDevice(empty(), 'Laser meter');
    const device = required(configuration.snapshot.modbus?.devices[0]);
    const before = configuration.snapshot.logicalChannels.map((channel) => channel.id);
    const next = saveDevice(configuration, device, busConnection(configuration.snapshot), meterProfile, supported);
    expect(next.snapshot.logicalChannels).toHaveLength(131);
    expect(next.snapshot.logicalChannels.slice(0, 11).map((channel) => channel.id)).toEqual(before);
    expect(readings(next, id).enabled).toEqual([...WAGO_879_3020_DEFAULT_ENABLED].sort());
    expect(readings(next, id).disabled).toHaveLength(120);
    expect(next.metadata.names[next.snapshot.logicalChannels[11].id]).toMatch(/^Laser meter · /);
  });

  it('never re-enables or migrates the readings of an existing configuration on its own', () => {
    let configuration = addDevice(empty(), 'Laser meter', supported).configuration;
    const device = required(configuration.snapshot.modbus?.devices[0]);
    configuration = saveDevice(configuration, device, busConnection(configuration.snapshot), meterProfile, {
      ...supported,
      disabledReadings: new Set(),
    });
    expect(readings(configuration, device.id).disabled).toEqual([]);
    const renamed = saveDevice(
      configuration,
      { ...device, name: 'Renamed' },
      busConnection(configuration.snapshot),
      meterProfile,
      supported,
    );
    expect(renamed.snapshot.logicalChannels).toEqual(configuration.snapshot.logicalChannels);
  });

  it('applies the recommended set and per-register choices of the device settings', () => {
    let configuration = addDevice(empty(), 'Laser meter', supported).configuration;
    configuration = addDevice(configuration, 'CNC meter', supported).configuration;
    const [first, second] = required(configuration.snapshot.modbus).devices;
    const choice = new Set(['active-power', 'reactive-power', 'tariff']);
    const disabledReadings = new Set(meterProfile.measurements.map((item) => item.id).filter((id) => !choice.has(id)));
    expect(enabledChannelCount(configuration.snapshot, first.id, meterProfile, disabledReadings)).toEqual({
      enabled: 14,
      max: MAX_ENABLED_CHANNELS,
    });
    configuration = saveDevice(configuration, first, busConnection(configuration.snapshot), meterProfile, {
      ...supported,
      disabledReadings,
    });
    expect(readings(configuration, first.id).enabled).toEqual([...choice].sort());
    expect(readings(configuration, second.id).enabled).toEqual([...WAGO_879_3020_DEFAULT_ENABLED].sort());
    expect(
      initialDisabledReadings(configuration, first.id, meterProfile, { isNew: false, disabledChannels: true }),
    ).toEqual(disabledReadings);
    const recommended = new Set(WAGO_879_3020_DEFAULT_ENABLED);
    configuration = saveDevice(configuration, first, busConnection(configuration.snapshot), meterProfile, {
      ...supported,
      disabledReadings: new Set(meterProfile.measurements.map((item) => item.id).filter((id) => !recommended.has(id))),
    });
    expect(readings(configuration, first.id).enabled).toEqual([...recommended].sort());
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
  });

  it('enables a register the operator adds to a custom map on the edited device', () => {
    const { configuration, id } = addDevice(empty(), 'Meter', supported);
    const device = required(configuration.snapshot.modbus?.devices[0]);
    const custom = duplicateProfile(meterProfile, 'custom-meter');
    const extra = { ...custom.measurements[0], id: 'extra', name: 'Extra', address: 0x7000 };
    const disabledReadings = initialDisabledReadings(configuration, id, custom, {
      isNew: false,
      disabledChannels: true,
    });
    const next = saveDevice(
      configuration,
      device,
      busConnection(configuration.snapshot),
      { ...custom, measurements: [...custom.measurements, extra] },
      { ...supported, disabledReadings },
    );
    expect(readings(next, id).enabled).toEqual([...WAGO_879_3020_DEFAULT_ENABLED, 'extra'].sort());
    expect(validateEditorSnapshot(next.snapshot)).toEqual([]);
  });

  it('re-enables a disabled reading when its point is rebound to an action', () => {
    const { configuration, id } = addDevice(empty(), 'Laser meter', supported);
    const disabled = required(configuration.snapshot.logicalChannels.find((channel) => channel.enabled === false));
    const next = bindModbusPoint(configuration.snapshot, disabled.physicalPointId, { deviceId: id, actionId: 'relay' });
    expect(next.logicalChannels.find((channel) => channel.id === disabled.id)?.enabled).toBeUndefined();
  });

  it('reads the disabled-channel capability from controller records and diagnostics', () => {
    expect(supportsDisabledChannels(JSON.stringify(['front-panel-v1', CHANNEL_ENABLED_CAPABILITY]))).toBe(true);
    expect(supportsDisabledChannels([CHANNEL_ENABLED_CAPABILITY])).toBe(true);
    expect(supportsDisabledChannels('["front-panel-v1"]')).toBe(false);
    expect(supportsDisabledChannels('not json')).toBe(false);
    expect(supportsDisabledChannels(undefined)).toBe(false);
  });

  it('keeps a reading enabled while a guard or feedback uses it, whatever the settings ask', () => {
    const { configuration: added, id } = addDevice(empty(), 'Laser meter', supported);
    const power = required(deviceReadingChannels(added.snapshot, id).get('active-power'));
    const current = required(deviceReadingChannels(added.snapshot, id).get('current-l1'));
    let configuration = updateTerminal(added, DIGITAL_TERMINALS[0], 'Laser', {
      capabilities: ['output', 'guard', 'feedback'],
      guard: { channelId: power, when: 'on' },
      feedback: { channelId: current, expected: 'match', timeoutMs: 1000 },
    });
    expect(requiredReadings(configuration, id)).toEqual(
      new Map([
        ['active-power', ['Laser']],
        ['current-l1', ['Laser']],
      ]),
    );
    const everything = new Set(meterProfile.measurements.map((item) => item.id));
    configuration = saveDevice(
      configuration,
      required(configuration.snapshot.modbus?.devices[0]),
      busConnection(configuration.snapshot),
      meterProfile,
      { ...supported, disabledReadings: everything },
    );
    expect(readings(configuration, id).enabled).toEqual(['active-power', 'current-l1']);
    // The server refuses a guard or feedback on a disabled channel; this snapshot is accepted.
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
    expect(
      initialDisabledReadings(configuration, id, meterProfile, { isNew: false, disabledChannels: true }).has(
        'active-power',
      ),
    ).toBe(false);
  });

  it('finds the readings of a custom map that no guard, feedback or flow needs', () => {
    const { configuration: added, id } = addDevice(empty(), 'Meter', supported);
    const custom = duplicateProfile(meterProfile, 'custom-meter');
    let configuration = saveDevice(
      added,
      required(added.snapshot.modbus?.devices[0]),
      busConnection(added.snapshot),
      custom,
      { ...supported, disabledReadings: new Set() },
    );
    const channels = deviceReadingChannels(configuration.snapshot, id);
    configuration = updateTerminal(configuration, DIGITAL_TERMINALS[0], 'Laser', {
      capabilities: ['output', 'guard'],
      guard: { channelId: required(channels.get('active-power')), when: 'on' },
    });
    const unused = unusedReadings(configuration, id, custom, new Set([required(channels.get('frequency'))]));
    expect(unused.has('active-power')).toBe(false);
    expect(unused.has('frequency')).toBe(false);
    expect(unused.size).toBe(custom.measurements.length - 2);
    const next = saveDevice(
      configuration,
      required(configuration.snapshot.modbus?.devices[0]),
      busConnection(configuration.snapshot),
      custom,
      { ...supported, disabledReadings: unused },
    );
    expect(readings(next, id).enabled).toEqual(['active-power', 'frequency']);
    expect(validateEditorSnapshot(next.snapshot)).toEqual([]);
  });

  it('treats loading or failed diagnostics as unknown support, not as an old runtime', () => {
    expect(channelEnabledSupport({ data: undefined })).toBe('checking');
    expect(channelEnabledSupport({ data: undefined, isError: true })).toBe('unknown');
    expect(channelEnabledSupport({ data: { capabilities: ['front-panel-v1'] } })).toBe('unsupported');
    expect(channelEnabledSupport({ data: { capabilities: [CHANNEL_ENABLED_CAPABILITY] }, isError: true })).toBe(
      'supported',
    );
  });

  it('applies the same disable rule as server validation', () => {
    const points = [
      { id: 'reading', hardwareProfile: 'modbus' as const, channel: 0, modbus: { deviceId: 'd', measurementId: 'm' } },
      {
        id: 'action',
        hardwareProfile: 'modbus' as const,
        channel: 0,
        modbus: { deviceId: 'd', measurementId: 'm', actionId: 'a' },
      },
      { id: 'switch', hardwareProfile: 'modbus' as const, channel: 0, modbus: { deviceId: 'd', actionId: 'a' } },
      { id: 'terminal', hardwareProfile: '751-9301' as const, channel: 0 },
    ];
    const capabilitySets = [
      [],
      ['input'],
      ['measurement'],
      ['input', 'measurement'],
      ['input', 'feedback'],
      ['output'],
    ];
    for (const point of points)
      for (const capabilities of capabilitySets) {
        const errors: ConfigurationValidationError[] = [];
        validateEnabled(
          { enabled: false, physicalPointId: point.id },
          '$',
          new Set(capabilities),
          new Map([[point.id, point]]),
          errors,
        );
        expect(
          canDisableChannel(
            { capabilities: capabilities as Parameters<typeof canDisableChannel>[0]['capabilities'] },
            point,
          ),
          `${point.id} ${capabilities.join('+')}`,
        ).toBe(errors.length === 0);
      }
  });

  it('creates profile bindings automatically and shares one serial bus across devices', () => {
    let configuration = addDevice(empty(), 'Laser meter', supported).configuration;
    configuration = addDevice(configuration, 'CNC meter', supported).configuration;
    const profile = BUILTIN_MODBUS_PROFILES[0];
    expect(configuration.snapshot.modbus?.connections).toHaveLength(1);
    expect(configuration.snapshot.modbus?.devices.map((device) => device.unitId)).toEqual([1, 2]);
    expect(configuration.snapshot.logicalChannels).toHaveLength(profile.measurements.length * 2);
    expect(validateEditorModel(configuration.snapshot)).toEqual([]);
    const bus = busConnection(configuration.snapshot);
    configuration = updateBus(configuration, {
      ...bus,
      transport: 'rtu',
      path: '/dev/serial',
      baudRate: 19200,
      parity: 'odd',
      stopBits: 2,
    });
    expect(configuration.snapshot.modbus?.connections[0]).toMatchObject({
      baudRate: 19200,
      parity: 'odd',
      stopBits: 2,
    });
  });

  it('customizes a profile without modifying the built-in map and preserves existing signal identities', () => {
    const { configuration, id } = addDevice(empty(), 'Meter', supported);
    const before = configuration.snapshot.logicalChannels.map((channel) => channel.id);
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom-meter');
    const next = saveDevice(
      configuration,
      { ...required(configuration.snapshot.modbus).devices[0], pollIntervalMs: 2500 },
      busConnection(configuration.snapshot),
      profile,
    );
    expect(next.snapshot.logicalChannels.map((channel) => channel.id)).toEqual(before);
    expect(next.snapshot.logicalChannels).toEqual(configuration.snapshot.logicalChannels);
    expect(next.snapshot.modbus?.devices.find((device) => device.id === id)?.pollIntervalMs).toBe(2500);
    expect(next.snapshot.modbus?.profiles[0]).toEqual(profile);
    expect(BUILTIN_MODBUS_PROFILES[0].id).toBe('wago-879-3020');
    expect(validateEditorModel(next.snapshot)).toEqual([]);
  });

  it('reconciles every device when a shared custom profile loses registers', () => {
    let configuration = addDevice(empty(), 'First meter').configuration;
    configuration = addDevice(configuration, 'Second meter').configuration;
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'shared-meter');
    const devices = required(configuration.snapshot.modbus).devices;
    for (const device of devices)
      configuration = saveDevice(configuration, device, busConnection(configuration.snapshot), profile);
    const retained = profile.measurements[0];
    configuration = saveDevice(configuration, devices[0], busConnection(configuration.snapshot), {
      ...profile,
      measurements: [retained],
    });
    expect(configuration.snapshot.physicalPoints).toHaveLength(2);
    expect(configuration.snapshot.physicalPoints.every((point) => point.modbus?.measurementId === retained.id)).toBe(
      true,
    );
    expect(validateEditorModel(configuration.snapshot)).toEqual([]);
  });

  it('adds switch bindings, prunes removed registers and removes all bindings of a removed device', () => {
    const { configuration, id } = addDevice(empty(), 'Relay');
    const profile = {
      id: 'relay',
      name: 'Relay',
      version: 1,
      measurements: [],
      actions: [
        {
          id: 'switch',
          name: 'Relay 1',
          functionCode: 5 as const,
          address: 0,
          addressBase: 0 as const,
          dataType: 'uint16' as const,
          byteOrder: 'big' as const,
          wordOrder: 'big' as const,
          scale: 1,
          offset: 0,
          onValue: 1,
          offValue: 0,
        },
      ],
    };
    const next = saveDevice(
      configuration,
      required(configuration.snapshot.modbus).devices[0],
      busConnection(configuration.snapshot),
      profile,
    );
    expect(next.snapshot.logicalChannels).toHaveLength(1);
    expect(next.snapshot.logicalChannels[0].capabilities).toEqual(['output']);
    expect(validateEditorModel(next.snapshot)).toEqual([]);
    const removed = removeDevice(next, id);
    expect(removed.snapshot.logicalChannels).toEqual([]);
    expect(removed.snapshot.physicalPoints).toEqual([]);
    expect(removed.snapshot.modbus?.devices).toEqual([]);
  });
});
