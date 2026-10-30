import type { DeviceAdapter, Snapshot } from '../../runtime';

export type Acquisition = {
  channels: Snapshot['logicalChannels'];
} & ({ ok: true; raw: boolean | number; timestamp: string } | { ok: false; error: unknown });

type Source = { point: Snapshot['physicalPoints'][number]; channels: Snapshot['logicalChannels'] };

/** Sweep-local fanout, never a cache of past samples. Encoders receive actual read completion time. */
export async function* acquireMeasurements(snapshot: Snapshot, device: DeviceAdapter): AsyncGenerator<Acquisition> {
  const sources = new Map<string, Source>();
  const points = new Map(snapshot.physicalPoints.map((point) => [point.id, point]));
  for (const channel of snapshot.logicalChannels) {
    // A disabled channel causes no bus traffic, measurement or fault; a source only it uses is never read.
    if (channel.enabled === false || !channel.capabilities.includes('measurement')) continue;
    const point = points.get(channel.physicalPointId);
    if (!point) continue;
    let key: string;
    try {
      key = device.measurementSource?.(point) ?? point.id;
    } catch (error) {
      yield { ok: false, channels: [channel], error };
      continue;
    }
    const source = sources.get(key);
    if (source) source.channels.push(channel);
    else sources.set(key, { point, channels: [channel] });
  }
  if (device.readMeasurements) {
    const pending = new Map<string, Source>();
    for (const source of sources.values()) {
      try {
        if (!device.shouldPoll || device.shouldPoll(source.point, Date.now())) pending.set(source.point.id, source);
      } catch (error) {
        yield { ok: false, channels: source.channels, error };
      }
    }
    try {
      for await (const reading of device.readMeasurements([...pending.values()].map((source) => source.point))) {
        const source = pending.get(reading.pointId);
        if (!source) continue;
        pending.delete(reading.pointId);
        yield { ...reading, channels: source.channels };
      }
    } catch (error) {
      for (const source of pending.values()) yield { ok: false, channels: source.channels, error };
    }
    return;
  }
  for (const { point, channels } of sources.values()) {
    let result: Acquisition;
    try {
      if (device.shouldPoll && !device.shouldPoll(point, Date.now())) continue;
      const raw = await device.read(point);
      result = { ok: true, channels, raw, timestamp: new Date().toISOString() };
    } catch (error) {
      result = { ok: false, channels, error };
    }
    yield result;
  }
}

/** Preserve MeasurementContractError and transport-specific codes through the runtime fault hook. */
export function measurementErrorCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'measurement_read_failed';
}
