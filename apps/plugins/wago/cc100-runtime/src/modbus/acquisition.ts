import type { DeviceAdapter, Snapshot } from '../runtime';

export type Acquisition = {
  channels: Snapshot['logicalChannels'];
} & ({ ok: true; raw: boolean | number; timestamp: string } | { ok: false; error: unknown });

/** Sweep-local fanout, never a cache of past samples. Encoders receive actual read completion time. */
export async function* acquireMeasurements(snapshot: Snapshot, device: DeviceAdapter): AsyncGenerator<Acquisition> {
  const sources = new Map<
    string,
    { point: Snapshot['physicalPoints'][number]; channels: Snapshot['logicalChannels'] }
  >();
  for (const channel of snapshot.logicalChannels.filter((c) => c.capabilities.includes('measurement'))) {
    const point = snapshot.physicalPoints.find((p) => p.id === channel.physicalPointId);
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
