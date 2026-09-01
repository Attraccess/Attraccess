import { type DeviceAdapter, type RuntimeState, type Snapshot } from './runtime-types';

type LogicalChannel = Snapshot['logicalChannels'][number];

export class OutputController {
  private readonly pulses = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly options: {
      device: DeviceAdapter;
      getSnapshot: () => Snapshot | undefined;
      getState: () => RuntimeState;
      saveState: () => Promise<void>;
      publishState: () => Promise<void>;
      publishFault: (channelId: string, error: unknown) => Promise<void>;
    },
  ) {}

  async write(channel: LogicalChannel, value: boolean, onWritten?: () => void): Promise<boolean> {
    const point = this.options.getSnapshot()?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return false;
    try {
      await this.options.device.write(point, value);
    } catch (error) {
      try {
        await this.options.publishFault(channel.id, error);
      } catch {
        // A fault-publication failure must not turn a known failed write into an accepted command.
      }
      return false;
    }
    onWritten?.();
    this.options.getState().outputs[channel.id] = value;
    try {
      await this.options.saveState();
    } catch {
      // Do not acknowledge an operation whose durable output state is stale.
      throw new Error('failed to persist channel state');
    }
    try {
      await this.options.publishState();
    } catch {
      // Retained-state publication does not change the durable state of a successful write.
    }
    return true;
  }

  async isGuardSatisfied(channel: LogicalChannel): Promise<boolean> {
    if (!channel.guard) return true;
    const snapshot = this.options.getSnapshot();
    const guardChannel = snapshot?.logicalChannels.find((item) => item.id === channel.guard?.channelId);
    const guardPoint = snapshot?.physicalPoints.find((item) => item.id === guardChannel?.physicalPointId);
    if (!guardPoint) return false;
    try {
      return Boolean(await this.options.device.read(guardPoint)) === (channel.guard.when === 'on');
    } catch {
      return false;
    }
  }

  schedulePulse(channel: LogicalChannel, duration: number): void {
    const existingPulse = this.pulses.get(channel.id);
    if (existingPulse) clearTimeout(existingPulse);
    this.pulses.set(channel.id, setTimeout(() => void this.ignoreRejection(() => this.write(channel, false)), duration));
  }

  async applyDisconnectPolicies(connected: boolean): Promise<void> {
    if (connected) {
      this.watchdogs.forEach(clearTimeout);
      this.watchdogs.clear();
      return;
    }
    let stateSaveFailed = false;
    for (const channel of this.options.getSnapshot()?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (channel.disconnectPolicy.mode === 'immediate') {
        try {
          await this.write(channel, false);
        } catch {
          // Continue the safety shutdown even when durable state cannot be updated for one output.
          stateSaveFailed = true;
        }
      }
      if (channel.disconnectPolicy.mode === 'watchdog')
        this.watchdogs.set(
          channel.id,
          setTimeout(
            () => void this.ignoreRejection(() => this.write(channel, false)),
            channel.disconnectPolicy.timeoutMs,
          ),
        );
    }
    if (stateSaveFailed) await this.options.saveState();
  }

  private ignoreRejection(callback: () => Promise<unknown>): void {
    void callback().catch(() => undefined);
  }
}
