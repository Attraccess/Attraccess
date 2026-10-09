import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  type ModbusConfiguration,
  validateModbus,
} from '../../../../modbus/model';
import { CumulativeCounter, ModbusDeviceRouter } from '../routing/adapter';
import { decodeRaw, encode, readPdu } from './protocol';

import { ModbusProtocolFixture, format, serial } from '../routing/routing.test-utils';
describe('Modbus protocol fixtures (no hardware)', () => {
  let fixture: ModbusProtocolFixture;
  beforeEach(() => {
    fixture = new ModbusProtocolFixture();
    fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  it.each(['uint16', 'int16', 'uint32', 'int32', 'float32'] as const)(
    'round trips %s byte and word order with physical scaling',
    (dataType) => {
      for (const byteOrder of ['big', 'little'] as const)
        for (const wordOrder of ['big', 'little'] as const) {
          const f = { ...format, dataType, byteOrder, wordOrder, scale: 0.5, offset: 7 };
          expect(decodeRaw(encode(1234.5, f), f) * f.scale + f.offset).toBe(1234.5);
          expect(readPdu(3, f).readUInt16BE(1)).toBe(11);
        }
    },
  );

  it('does not infer rollover; recognizes only explicit boundary crossing', () => {
    const counter = new CumulativeCounter();
    expect(counter.update(95, 100)).toBe(95);
    expect(counter.update(3, 100)).toBe(103);
    expect(counter.update(7, 100)).toBe(107);
    expect(() => counter.update(0, 100)).toThrow('reset');
    const unknown = new CumulativeCounter();
    unknown.update(99);
    expect(() => unknown.update(1)).toThrow('without documented');
  });

  it('validates profiles and routes named measurements/actions, bounded duplicate acquisition', async () => {
    const meter = BUILTIN_MODBUS_PROFILES.find((profile) => profile.id === 'wago-879-3020');
    if (!meter) throw new Error('Missing 879-3020 profile');
    const profile = duplicateProfile(meter, 'custom');
    // Custom integer counter fixture, independent of the meter's float kWh map.
    const energy = profile.measurements.find((measurement) => measurement.id === 'import-energy');
    if (!energy) throw new Error('Missing imported energy fixture');
    energy.dataType = 'uint32';
    energy.scale = 1;
    const config: ModbusConfiguration = {
      connections: [serial],
      profiles: [profile],
      devices: [{ id: 'meter', name: 'Meter', connectionId: 'bus', unitId: 7, profileId: 'custom', profileVersion: 1 }],
    };
    expect(validateModbus(config)).toEqual([]);
    let release: (b: Buffer) => void = () => undefined;
    const transport = {
      request: jest.fn(
        () =>
          new Promise<Buffer>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const onboard = { read: jest.fn(), write: jest.fn() };
    const router = new ModbusDeviceRouter(onboard, () => transport);
    router.configure({ version: 1, physicalPoints: [], logicalChannels: [], modbus: config });
    const point = {
      id: 'p',
      channel: 0,
      hardwareProfile: '879-1300' as const,
      modbus: { deviceId: 'meter', measurementId: 'import-energy' },
    };
    const reading = router.read(point);
    await expect(router.read(point)).rejects.toThrow('already in progress');
    release(Buffer.from([0, 0, 0, 12]));
    await expect(reading).resolves.toBe(12);
    await expect(router.write(point, true)).rejects.toThrow('read-only');
    expect(onboard.read).not.toHaveBeenCalled();
    expect(router.shouldPoll(point, 100)).toBe(true);
    expect(router.shouldPoll(point, 101)).toBe(false);
    expect(validateModbus({ ...config, profiles: [BUILTIN_MODBUS_PROFILES[0]] }).length).toBeGreaterThan(0);
  });
});
