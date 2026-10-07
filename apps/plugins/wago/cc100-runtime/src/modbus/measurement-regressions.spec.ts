import { ModbusDeviceRouter } from './adapter';
import { QueuedModbusTransport } from './transports';
import { readPdu, rtuFrame } from './protocol';
import { acquireMeasurements, measurementErrorCode } from './acquisition';
import { deferred, snapshot, harness, onboard } from './review-regressions.test-utils';
describe('ATT-1059 independent review regressions', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('preserves cumulative rollover and decrease-fault history across unrelated revisions', async () => {
    for (const rollover of [100, undefined]) {
      const s = snapshot();
      s.modbus.profiles[0].measurements[0].rollover = rollover;
      const values = [95, 3, 4];
      const router = new ModbusDeviceRouter(onboard, () => ({
        request: async () => Buffer.from([0, values.shift() ?? 0]),
      }));
      router.configure(s);
      expect(await router.read(s.physicalPoints[0])).toBe(95);
      if (rollover) expect(await router.read(s.physicalPoints[0])).toBe(103);
      else await expect(router.read(s.physicalPoints[0])).rejects.toThrow('decreased');
      const next = structuredClone(s);
      next.modbus.devices[0].name = 'Renamed';
      next.modbus.profiles[0].version = 2;
      next.modbus.devices[0].profileVersion = 2;
      next.modbus.profiles[0].measurements[0].pollIntervalMs = 200;
      router.configure(next);
      if (rollover) expect(await router.read(next.physicalPoints[0])).toBe(104);
      else await expect(router.read(next.physicalPoints[0])).rejects.toThrow('decreased');
    }
  });

  it('acquires one shared source once and publishes all bound channels with the original read timestamp', async () => {
    const s = snapshot();
    s.modbus.profiles[0].measurements[0].scale = 0.05;
    s.physicalPoints.push({ ...s.physicalPoints[0], id: 'alias' });
    s.logicalChannels.push({ ...s.logicalChannels[0], id: 'energy-2', physicalPointId: 'alias' });
    const request = jest.fn(async () => Buffer.from([0, 10]));
    const router = new ModbusDeviceRouter(onboard, () => ({ request }));
    const { runtime, published } = harness(s, router);
    await runtime.start();
    await runtime.publishMeasurements();
    const events = published.filter((p) => p.topic.endsWith('/measurements'));
    expect(events.map((p) => p.payload.channelId)).toEqual(['energy-1', 'energy-2']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(Number(events[1].payload.sequence)).toBe(Number(events[0].payload.sequence) + 1);
    for (const { payload } of events) {
      expect(payload).toEqual(
        expect.objectContaining({
          unit: 'milliwatt-hour',
          value: 500,
          kind: 'cumulative',
          timestamp: expect.any(String),
          streamId: expect.any(String),
        }),
      );
      expect(payload).not.toHaveProperty('sourceTimestamp');
    }
    expect(events[0].payload.timestamp).toEqual(events[1].payload.timestamp);
    expect(events[0].payload.streamId).toEqual(published.find((p) => p.topic.endsWith('/state'))?.payload.streamId);
    await runtime.publishMeasurements();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('quarantines RTU after timeout, rejecting another same-length/different-address read before and after late teardown', async () => {
    const s = snapshot();
    const c = s.modbus.connections[0];
    const late = deferred<Buffer>();
    const exchange = jest.fn(() => late.promise);
    const transport = new QueuedModbusTransport(c, exchange);
    const a = readPdu(3, s.modbus.profiles[0].measurements[0]);
    const b = Buffer.from(a);
    b.writeUInt16BE(22, 1);
    await expect(transport.request(1, a)).rejects.toThrow('timed out');
    const replacement = new QueuedModbusTransport(c, exchange);
    // The late A response has a valid CRC/unit/function/count for B, but B must never be sent.
    const second = replacement.request(1, b).catch((e: Error) => e);
    late.resolve(rtuFrame(1, Buffer.from([3, 2, 0, 99])));
    expect(await second).toBeInstanceOf(Error);
    await expect(replacement.request(1, b)).rejects.toThrow('quarantin');
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('preserves actual acquisition time while publication is delayed, and retains typed errors for the ATT-979 encoder', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const s = snapshot();
    s.logicalChannels.push({ ...s.logicalChannels[0], id: 'energy-2' });
    const router = new ModbusDeviceRouter(onboard, () => ({
      request: async () => {
        jest.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
        return Buffer.from([0, 10]);
      },
    }));
    router.configure(s);
    const readings = acquireMeasurements(s, router);
    const result = await readings.next();
    jest.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
    expect(result.value).toEqual(expect.objectContaining({ ok: true, timestamp: '2026-01-01T00:00:01.000Z', raw: 10 }));
    const typed = Object.assign(new Error('encoder rejected fraction'), { code: 'invalid_measurement_transform' });
    expect(measurementErrorCode(typed)).toBe('invalid_measurement_transform');
    const failing = new ModbusDeviceRouter(onboard, () => ({
      request: async () => {
        throw Object.assign(new Error('ambiguous'), { code: 'modbus_rtu_quarantined' });
      },
    }));
    const { runtime, published } = harness(s, failing);
    await runtime.start();
    await runtime.publishMeasurements();
    expect(published.filter((p) => p.topic.endsWith('/faults')).map((p) => p.payload.code)).toEqual([
      'modbus_rtu_quarantined',
      'modbus_rtu_quarantined',
    ]);
    expect(published.some((p) => p.topic.endsWith('/measurements'))).toBe(false);
  });
});
