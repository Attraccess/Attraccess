import type { DeviceAdapter, Snapshot } from './runtime';

type Point = Snapshot['physicalPoints'][number];

export class SimulatorDeviceAdapter implements DeviceAdapter {
  private readonly values = new Map<string, boolean | number>();
  private readonly initialValues: Record<string, boolean | number>;

  constructor(
    initialValues: Record<string, boolean | number>,
    private readonly scenario: string,
    private readonly measurementStep: number,
  ) {
    this.initialValues = initialValues;
  }

  async write(point: Point, value: boolean): Promise<void> {
    if (this.scenario === 'write-failure') throw new Error('simulated output write failure');
    this.values.set(key(point), value);
  }

  async read(point: Point): Promise<boolean | number> {
    const pointKey = key(point);
    const value = this.values.get(pointKey) ?? this.initialValues[pointKey] ?? false;
    if (typeof value === 'number') {
      const next = value + this.measurementStep;
      this.values.set(pointKey, next);
      return next;
    }
    if (this.scenario === 'feedback-mismatch' && this.values.has(pointKey)) return !value;
    return value;
  }

  restore(snapshot: Snapshot | undefined, outputs: Record<string, boolean>): void {
    if (!snapshot) return;
    for (const channel of snapshot.logicalChannels) {
      if (!channel.capabilities.includes('output') || outputs[channel.id] === undefined) continue;
      const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (point) this.values.set(key(point), outputs[channel.id]);
    }
  }
}

function key(point: Point): string { return `${point.hardwareProfile}:${point.channel}`; }
