import { validateSnapshot } from './configuration';
import { BUILTIN_MODBUS_PROFILES, duplicateProfile, type ModbusConfiguration, validateModbus } from '../modbus/model';

function configuration(): ModbusConfiguration {
  return {
    connections: [
      {
        id: 'bus',
        transport: 'tcp',
        host: 'meter.invalid',
        port: 502,
        timeoutMs: 1000,
        reconnectMs: 250,
        queueLimit: 16,
      },
    ],
    devices: [
      {
        id: 'meter',
        name: 'Meter',
        connectionId: 'bus',
        unitId: 2,
        profileId: BUILTIN_MODBUS_PROFILES[0].id,
        profileVersion: 1,
      },
    ],
    profiles: [],
  };
}
describe('Modbus persisted configuration', () => {
  it.each([
    null,
    {},
    { connections: null, profiles: [], devices: [] },
    { connections: [null], profiles: [], devices: [] },
    { connections: [], profiles: [false], devices: [] },
  ])('rejects malformed input without throwing: %p', (value) =>
    expect(validateModbus(value).length).toBeGreaterThan(0),
  );
  it('rejects malformed nested register maps', () => {
    for (const entry of [null, {}, { id: 'bad', name: 'Bad' }, { id: 'bad', name: 'Bad', dataType: 3 }]) {
      expect(
        validateModbus({
          ...configuration(),
          profiles: [{ id: 'custom', name: 'Custom', version: 1, measurements: [entry], actions: [] }],
        }).length,
      ).toBeGreaterThan(0);
    }
  });
  it('validates limits, immutable maps, unsupported writes and references', () => {
    const config = configuration();
    expect(validateModbus(config)).toEqual([]);
    expect(validateModbus({ ...config, qualified: true }).length).toBeGreaterThan(0);
    expect(
      validateModbus({
        ...config,
        connections: [...config.connections, { ...config.connections[0], id: 'duplicate-bus' }],
      }).length,
    ).toBeGreaterThan(0);
    expect(validateModbus({ ...config, devices: [{ ...config.devices[0], unitId: 0 }] }).length).toBeGreaterThan(0);
    const custom = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom');
    custom.measurements[0].address = 65535;
    expect(validateModbus({ ...config, profiles: [custom] }).length).toBeGreaterThan(0);
    custom.measurements = [];
    custom.actions = [
      {
        id: 'a',
        name: 'A',
        address: 0,
        addressBase: 0,
        byteOrder: 'big',
        wordOrder: 'big',
        dataType: 'uint32',
        scale: 1,
        offset: 0,
        functionCode: 6,
        onValue: 1,
        offValue: 0,
      },
    ];
    expect(validateModbus({ ...config, profiles: [custom] }).length).toBeGreaterThan(0);
    custom.actions[0].functionCode = 16;
    expect(validateModbus({ ...config, profiles: [custom] })).toEqual([]);
    custom.actions[0].onValue = -1;
    expect(validateModbus({ ...config, profiles: [custom] }).length).toBeGreaterThan(0);
  });
  it('requires named profile bindings and prevents double scaling or writes to read-only maps', () => {
    const snapshot = {
      version: 1,
      modbus: configuration(),
      physicalPoints: [
        {
          id: 'p',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'meter', measurementId: 'active-power' },
        },
      ],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'p',
          profile: 'generic-monitored-input',
          capabilities: ['input', 'measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0, kind: 'live' },
        },
      ],
    };
    expect(validateSnapshot(snapshot)).toEqual([]);
    snapshot.logicalChannels[0].measurement.scale = 1000;
    expect(validateSnapshot(snapshot).some((e) => e.code === 'invalid_modbus_binding')).toBe(true);
    snapshot.logicalChannels[0].measurement.scale = 1;
    snapshot.logicalChannels[0].capabilities.push('output');
    expect(validateSnapshot(snapshot).some((e) => e.message.includes('named action'))).toBe(true);
  });
});
