import { validateSnapshot as validateBackend } from '../../../backend/configuration';
import { type Snapshot, validateSnapshot as validateRuntime } from '../runtime';

import { ModbusDeviceRouter } from './adapter';

import { snapshot, onboard } from './review-regressions.test-utils';
describe('ATT-973 runtime independent findings', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it.each(['same-point', 'aliased-action', 'overlapping-register'])(
    'rejects multiple physical output owners (%s) at both boundaries',
    (mode) => {
      const s: Snapshot = snapshot();
      const config = s.modbus;
      if (!config) throw new Error('fixture requires Modbus');
      const second = { ...s.logicalChannels[1], id: 'other-output' };
      if (mode !== 'same-point') {
        const action = { ...config.profiles[0].actions[0], id: 'alias' };
        if (mode === 'overlapping-register') {
          action.address = 11;
          action.functionCode = 16;
          action.dataType = 'uint32';
        }
        config.profiles[0].actions.push(action);
        config.devices.push({ ...config.devices[0], id: 'alias-device' });
        s.physicalPoints.push({
          ...s.physicalPoints[0],
          id: 'alias-point',
          modbus: { deviceId: 'alias-device', actionId: 'alias' },
        });
        second.physicalPointId = 'alias-point';
      }
      s.logicalChannels.push(second);
      for (const validate of [validateRuntime, validateBackend])
        expect(validate(s)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'invalid_modbus_binding',
              message: expect.stringContaining('single logical owner'),
            }),
          ]),
        );
    },
  );

  it.each([
    ['2001:db8::1', '2001:0db8:0:0:0:0:0:1'],
    ['2001:DB8::A', '2001:db8:0:0:0:0:0:a'],
    ['::ffff:192.0.2.1', '0:0:0:0:0:ffff:c000:201'],
    ['192.0.2.1', '::ffff:c000:201'],
    ['fe80::1%eth0', 'fe80:0:0:0:0:0:0:1%eth0'],
  ])('rejects connection aliases %s / %s at both acceptance boundaries', (host, alias) => {
    const s: Snapshot = snapshot();
    const config = s.modbus;
    if (!config) throw new Error('fixture requires Modbus');
    const connection = {
      id: 'bus',
      transport: 'tcp' as const,
      host,
      port: 502,
      timeoutMs: 1000,
      reconnectMs: 0,
      queueLimit: 4,
    };
    config.connections = [connection, { ...connection, id: 'alias-bus', host: alias }];
    config.devices.push({ ...config.devices[0], id: 'alias-device', connectionId: 'alias-bus' });
    s.physicalPoints.push({
      ...s.physicalPoints[0],
      id: 'alias-point',
      modbus: { deviceId: 'alias-device', actionId: 'switch' },
    });
    s.logicalChannels.push({ ...s.logicalChannels[1], id: 'alias-output', physicalPointId: 'alias-point' });
    for (const validate of [validateRuntime, validateBackend])
      expect(validate(s)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_modbus',
            message: expect.stringContaining('same endpoint'),
          }),
        ]),
      );
  });

  it.each(['address', 'port', 'scope'])('preserves independent numeric endpoints with a different %s', (difference) => {
    const s: Snapshot = snapshot();
    const config = s.modbus;
    if (!config) throw new Error('fixture requires Modbus');
    const connection = {
      id: 'bus',
      transport: 'tcp' as const,
      host: 'fe80::1%eth0',
      port: 502,
      timeoutMs: 1000,
      reconnectMs: 0,
      queueLimit: 4,
    };
    config.connections = [
      connection,
      {
        ...connection,
        id: 'other-bus',
        host: difference === 'address' ? 'fe80::2%eth0' : difference === 'scope' ? 'fe80::1%eth1' : connection.host,
        port: difference === 'port' ? 503 : connection.port,
      },
    ];
    config.devices.push({ ...config.devices[0], id: 'other-device', connectionId: 'other-bus' });
    s.physicalPoints.push({
      ...s.physicalPoints[0],
      id: 'other-point',
      modbus: { deviceId: 'other-device', actionId: 'switch' },
    });
    s.logicalChannels.push({ ...s.logicalChannels[1], id: 'other-output', physicalPointId: 'other-point' });
    expect(validateRuntime(s)).toEqual([]);
    expect(validateBackend(s)).toEqual([]);
  });

  it('keeps numeric source identity across equivalent connection spellings', () => {
    const s: Snapshot = snapshot();
    if (!s.modbus) throw new Error('fixture requires Modbus');
    s.modbus.connections = [
      { id: 'bus', transport: 'tcp', host: '2001:db8::1', port: 502, timeoutMs: 1000, reconnectMs: 0, queueLimit: 4 },
    ];
    const router = new ModbusDeviceRouter(onboard, () => ({ request: jest.fn() }));
    router.configure(s);
    const source = router.measurementSource(s.physicalPoints[0]);
    const connection = s.modbus.connections[0];
    if (connection.transport !== 'tcp') throw new Error('fixture requires TCP');
    connection.host = '2001:0db8:0:0:0:0:0:1';
    router.configure(s);
    expect(router.measurementSource(s.physicalPoints[0])).toBe(source);
  });

  it.each(['different-unit', 'coil-space', 'adjacent-register'])(
    'allows independent physical output ownership (%s)',
    (mode) => {
      const s: Snapshot = snapshot();
      const config = s.modbus;
      if (!config) throw new Error('fixture requires Modbus');
      const action = { ...config.profiles[0].actions[0], id: 'independent' };
      if (mode === 'coil-space') action.functionCode = 5;
      if (mode === 'adjacent-register') action.address++;
      config.profiles[0].actions.push(action);
      config.devices.push({ ...config.devices[0], id: 'other-device', unitId: mode === 'different-unit' ? 2 : 1 });
      s.physicalPoints.push({
        ...s.physicalPoints[0],
        id: 'other-point',
        modbus: { deviceId: 'other-device', actionId: 'independent' },
      });
      s.logicalChannels.push({ ...s.logicalChannels[1], id: 'other-output', physicalPointId: 'other-point' });
      expect(validateRuntime(s)).toEqual([]);
      expect(validateBackend(s)).toEqual([]);
    },
  );

  it('rejects input-only register channels consistently while preserving named measurement/action use', () => {
    const s = snapshot();
    expect(validateRuntime(s)).toEqual([]);
    expect(validateBackend(s)).toEqual([]);
    s.logicalChannels[0].capabilities = ['input'];
    Reflect.deleteProperty(s.logicalChannels[0], 'measurement');
    for (const validate of [validateRuntime, validateBackend])
      expect(validate(s)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid_modbus_binding',
            message: expect.stringContaining('measurement capability'),
          }),
        ]),
      );
  });
});
