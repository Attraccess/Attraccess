import { BUILTIN_MODBUS_PROFILES, duplicateProfile } from '../../../../modbus/model';
import { ModbusDeviceRouter } from './adapter';
import { acquireMeasurements } from './acquisition';
import type { Snapshot } from '../../runtime';
import { ModbusException } from '../protocol/protocol';
import { meterFleet } from '../../../../shared/configuration-limits.test-utils';
import { WAGO_879_3020_DEFAULT_ENABLED } from '../../../../modbus/wago-879-3020';

describe('complete meter acquisition over the shared serial bus', () => {
  const meter = BUILTIN_MODBUS_PROFILES[0];
  const points = meter.measurements.map((m) => ({
    id: m.id,
    hardwareProfile: 'modbus' as const,
    channel: 0,
    modbus: { deviceId: 'meter', measurementId: m.id },
  }));
  const snapshot: Snapshot = {
    version: 1,
    physicalPoints: points,
    logicalChannels: points.map((p) => ({
      id: p.id,
      physicalPointId: p.id,
      profile: 'generic-monitored-input',
      capabilities: ['measurement'],
      disconnectPolicy: { mode: 'hold' },
    })),
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'tcp',
          host: 'meter.invalid',
          port: 502,
          timeoutMs: 1000,
          reconnectMs: 0,
          queueLimit: 16,
        },
      ],
      profiles: [],
      devices: [
        {
          id: 'meter',
          name: 'Meter',
          connectionId: 'bus',
          unitId: 1,
          profileId: meter.id,
          profileVersion: meter.version,
        },
      ],
    },
  };
  it('reads every value using bounded contiguous requests with real acquisition timestamps', async () => {
    const request = jest.fn(async (_unit: number, pdu: Buffer) => Buffer.alloc(pdu.readUInt16BE(3) * 2));
    const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
    router.configure(snapshot);
    const readings = [];
    for await (const reading of acquireMeasurements(snapshot, router)) readings.push(reading);
    expect(readings).toHaveLength(131);
    expect(readings.every((r) => r.ok)).toBe(true);
    expect(request.mock.calls.length).toBeLessThan(16);
    for (const [, pdu] of request.mock.calls) expect(pdu.readUInt16BE(3)).toBeLessThanOrEqual(125);
    const timestamps = readings.flatMap((r) => (r.ok ? [r.timestamp] : []));
    expect(new Set(timestamps).size).toBeLessThan(16);
  });

  const phasePoints = points.filter((p) => ['voltage-l1', 'voltage-l2'].includes(p.id));
  it('decodes WAGO timer decimal digits before converting their units', async () => {
    const profile = duplicateProfile(meter, 'timer-fixture');
    profile.measurements = profile.measurements.map((m) =>
      ['s0-pulse-width', 'lcd-rolling-time'].includes(m.id) ? { ...m, encoding: 'bcd' } : m,
    );
    const configuration = structuredClone(snapshot);
    if (!configuration.modbus) throw new Error('Missing Modbus fixture');
    configuration.modbus.profiles = [profile];
    configuration.modbus.devices[0].profileId = profile.id;
    const request = jest.fn(async (_unit: number, pdu: Buffer) =>
      Buffer.from(pdu.readUInt16BE(1) === 0x4010 ? [0, 0x25] : [0, 0x30]),
    );
    const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
    router.configure(configuration);
    const values = new Map<string, number | boolean>();
    for await (const reading of router.readMeasurements(
      points.filter((p) => ['s0-pulse-width', 'lcd-rolling-time'].includes(p.id)),
    ))
      if (reading.ok) values.set(reading.pointId, reading.raw);
    expect(values.get('s0-pulse-width')).toBe(0.03);
    expect(values.get('lcd-rolling-time')).toBe(25);
  });
  const readingsFrom = async (
    request: (unit: number, pdu: Buffer) => Promise<Buffer>,
    existing?: ModbusDeviceRouter,
  ) => {
    const router =
      existing ?? new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
    if (!existing) router.configure(snapshot);
    const readings = [];
    for await (const reading of router.readMeasurements(phasePoints)) readings.push(reading);
    return readings;
  };
  it('decodes separate fields from their offsets and acquires again instead of replaying a cache', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-03T10:00:00Z'));
      const request = jest.fn(async () => {
        const bytes = Buffer.alloc(8);
        bytes.writeFloatBE(237.123, 0);
        bytes.writeFloatBE(238.456, 4);
        return bytes;
      });
      const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
      router.configure(snapshot);
      const first = await readingsFrom(request, router);
      expect(first.map((r) => r.ok && r.raw)).toEqual([237.123, 238.456]);
      jest.setSystemTime(new Date('2026-10-03T10:00:05Z'));
      const second = await readingsFrom(request, router);
      expect(request).toHaveBeenCalledTimes(2);
      expect(second.every((r) => r.ok && r.timestamp === '2026-10-03T10:00:05.000Z')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it('isolates a valid illegal-address reply without hiding other phase readings', async () => {
    const request = jest.fn(async (_unit: number, pdu: Buffer) => {
      if (pdu.readUInt16BE(3) > 2 || pdu.readUInt16BE(1) === 0x5004) throw new ModbusException(3, 2);
      const bytes = Buffer.alloc(4);
      bytes.writeFloatBE(237.123);
      return bytes;
    });
    const readings = await readingsFrom(request);
    expect(request).toHaveBeenCalledTimes(3);
    expect(readings[0]).toMatchObject({ pointId: 'voltage-l1', ok: true, raw: 237.123 });
    expect(readings[1]).toMatchObject({ pointId: 'voltage-l2', ok: false });
  });
  it('rejects invalid decimal digits without affecting other metadata', async () => {
    const request = jest.fn(async (_unit: number, pdu: Buffer) =>
      Buffer.from(pdu.readUInt16BE(1) === 0x4010 ? [0, 0x25] : [0, 0x3a]),
    );
    const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
    router.configure(snapshot);
    const readings = [];
    for await (const reading of router.readMeasurements(
      points.filter((p) => ['s0-pulse-width', 'lcd-rolling-time'].includes(p.id)),
    ))
      readings.push(reading);
    expect(readings).toContainEqual(expect.objectContaining({ pointId: 'lcd-rolling-time', ok: true, raw: 25 }));
    expect(readings).toContainEqual(expect.objectContaining({ pointId: 's0-pulse-width', ok: false }));
  });
  it('never retries an ambiguous timeout as individual requests', async () => {
    const request = jest.fn(async () => {
      throw new Error('RTU response timeout');
    });
    expect((await readingsFrom(request)).every((r) => !r.ok)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('discards bulk replies from an older configuration generation', async () => {
    const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({
      request: async () => {
        router.configure(snapshot);
        return Buffer.alloc(8);
      },
    }));
    router.configure(snapshot);
    const readings = [];
    for await (const reading of router.readMeasurements(phasePoints)) readings.push(reading);
    expect(readings.every((r) => !r.ok)).toBe(true);
  });
});

describe('acquisition of a meter fleet with disabled readings', () => {
  const sweep = async (snapshot: Snapshot) => {
    const request = jest.fn(async (_unit: number, pdu: Buffer) => Buffer.alloc(pdu.readUInt16BE(3) * 2));
    const router = new ModbusDeviceRouter({ read: async () => 0, write: async () => undefined }, () => ({ request }));
    router.configure(snapshot);
    const readings = [];
    for await (const reading of acquireMeasurements(snapshot, router)) readings.push(reading);
    const ranges = request.mock.calls.map(([unit, pdu]) => ({
      unit,
      start: pdu.readUInt16BE(1),
      end: pdu.readUInt16BE(1) + pdu.readUInt16BE(3),
    }));
    return { readings, ranges };
  };

  it('never requests a register only disabled channels use', async () => {
    const snapshot: Snapshot = meterFleet(1);
    const profile = BUILTIN_MODBUS_PROFILES.find((item) => item.id === 'wago-879-3020');
    if (!profile) throw new Error('missing 879-3020 profile');
    const enabled = snapshot.logicalChannels.filter((channel) => channel.enabled !== false);
    const registers = new Set(
      enabled.flatMap((channel) => {
        const measurement = profile.measurements.find((item) => channel.id.endsWith(`.${item.id}`));
        if (!measurement) throw new Error(`unknown measurement for ${channel.id}`);
        const width = ['float32', 'uint32', 'int32'].includes(measurement.dataType) ? 2 : 1;
        return Array.from({ length: width }, (_, index) => measurement.address + index);
      }),
    );

    const { readings, ranges } = await sweep(snapshot);

    expect(enabled).toHaveLength(11);
    expect(readings.flatMap((reading) => reading.channels.map((channel) => channel.id)).sort()).toEqual(
      enabled.map((channel) => channel.id).sort(),
    );
    for (const { start, end } of ranges)
      for (let register = start; register < end; register++) expect(registers).toContain(register);
  });

  it('builds the fleet fixture from the editor default-enabled 879-3020 readings', () => {
    const enabled = meterFleet(1)
      .logicalChannels.filter((channel) => channel.enabled !== false)
      .map((channel) => channel.id.replace(/^meter-0\./, ''));
    expect(enabled.sort()).toEqual([...WAGO_879_3020_DEFAULT_ENABLED].sort());
  });

  it('reads the default eleven 879-3020 readings in three requests per meter', async () => {
    // 0x5002-0x5013 (phase voltages, frequency, current, phase currents and active power are contiguous),
    // import energy 0x600c and export energy 0x6018. Blocks only merge contiguous registers.
    expect((await sweep(meterFleet(1))).ranges).toEqual([
      { unit: 1, start: 0x5002, end: 0x5014 },
      { unit: 1, start: 0x600c, end: 0x600e },
      { unit: 1, start: 0x6018, end: 0x601a },
    ]);
    const fleet = await sweep(meterFleet(10));
    expect(fleet.ranges).toHaveLength(30);
    expect(new Set(fleet.ranges.map(({ unit }) => unit)).size).toBe(10);
  });

  it('sends nothing on the bus for a meter whose readings are all disabled', async () => {
    const { readings, ranges } = await sweep(meterFleet(1, 0));
    expect(readings).toEqual([]);
    expect(ranges).toEqual([]);
  });
});
