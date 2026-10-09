// Verifies terminal identities and device bindings across front panel edits.
// FEATURE: WAGO front panel configuration preserves routing and profile contracts.
import { describe, expect, it } from 'vitest';
import { DIGITAL_TERMINALS } from '../../backend/configuration/digital';
import { validateEditorSnapshot } from '../../backend/configuration/editor';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../modbus/model';
import {
  addDevice,
  busConnection,
  removeDevice,
  saveDevice,
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
    expect(validateEditorSnapshot(next.snapshot)).toEqual([]);
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
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
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

  it('creates profile bindings automatically and shares one serial bus across devices', () => {
    let configuration = addDevice(empty(), 'Laser meter').configuration;
    configuration = addDevice(configuration, 'CNC meter').configuration;
    const profile = BUILTIN_MODBUS_PROFILES[0];
    expect(configuration.snapshot.modbus?.connections).toHaveLength(1);
    expect(configuration.snapshot.modbus?.devices.map((device) => device.unitId)).toEqual([1, 2]);
    expect(configuration.snapshot.logicalChannels).toHaveLength(profile.measurements.length * 2);
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
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
    const { configuration, id } = addDevice(empty(), 'Meter');
    const before = configuration.snapshot.logicalChannels.map((channel) => channel.id);
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom-meter');
    const next = saveDevice(
      configuration,
      { ...required(configuration.snapshot.modbus).devices[0], pollIntervalMs: 2500 },
      busConnection(configuration.snapshot),
      profile,
    );
    expect(next.snapshot.logicalChannels.map((channel) => channel.id)).toEqual(before);
    expect(next.snapshot.modbus?.devices.find((device) => device.id === id)?.pollIntervalMs).toBe(2500);
    expect(next.snapshot.modbus?.profiles[0]).toEqual(profile);
    expect(BUILTIN_MODBUS_PROFILES[0].id).toBe('wago-879-3020');
    expect(validateEditorSnapshot(next.snapshot)).toEqual([]);
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
    expect(validateEditorSnapshot(configuration.snapshot)).toEqual([]);
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
    expect(validateEditorSnapshot(next.snapshot)).toEqual([]);
    const removed = removeDevice(next, id);
    expect(removed.snapshot.logicalChannels).toEqual([]);
    expect(removed.snapshot.physicalPoints).toEqual([]);
    expect(removed.snapshot.modbus?.devices).toEqual([]);
  });
});
