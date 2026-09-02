import { type DeviceAdapter, type RuntimeState, type Snapshot } from './runtime-types';

type LogicalChannel = Snapshot['logicalChannels'][number];

export class OutputController {
  private readonly pulses = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly channelWrites = new Map<string, Promise<void>>();
  private readonly feedbackChecks = new Map<string, { timer: ReturnType<typeof setTimeout>; generation: number }>();
  private readonly feedbackGenerations = new Map<string, number>();
  private feedbackGenerationSequence = 0;
  private configurationGeneration = 0;

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

  replaceConfiguration(): void {
    this.configurationGeneration += 1;
    this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
    this.feedbackChecks.clear();
  }

  async runForChannel<T>(channelId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.channelWrites.get(channelId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.channelWrites.set(channelId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.channelWrites.get(channelId) === current) this.channelWrites.delete(channelId);
    }
  }

  async write(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
  ): Promise<boolean> {
    return this.runForChannel(channel.id, () => this.writeWhileQueued(channel, value, onWritten, onCommitted));
  }

  async writeWhileQueued(
    channel: LogicalChannel,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
  ): Promise<boolean> {
    const configurationGeneration = this.configurationGeneration;
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
    onCommitted?.();
    try {
      await this.options.publishState();
    } catch {
      // Retained-state publication does not change the durable state of a successful write.
    }
    if (configurationGeneration === this.configurationGeneration) this.scheduleFeedbackCheck(channel, value);
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
    const configurationGeneration = this.configurationGeneration;
    this.pulses.set(
      channel.id,
      setTimeout(
        () =>
          void this.ignoreRejection(() =>
            this.runForChannel(channel.id, async () => {
              if (this.configurationGeneration !== configurationGeneration) return;
              this.pulses.delete(channel.id);
              await this.writeWhileQueued(channel, false);
            }),
          ),
        duration,
      ),
    );
  }

  clearPulse(channelId: string): void {
    const pulse = this.pulses.get(channelId);
    if (!pulse) return;
    clearTimeout(pulse);
    this.pulses.delete(channelId);
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

  private scheduleFeedbackCheck(channel: LogicalChannel, value: boolean): void {
    if (!channel.feedback) return;
    const generation = ++this.feedbackGenerationSequence;
    this.feedbackGenerations.set(channel.id, generation);
    const existing = this.feedbackChecks.get(channel.id);
    if (existing) clearTimeout(existing.timer);
    const configurationGeneration = this.configurationGeneration;
    const timer = setTimeout(() => {
      this.feedbackChecks.delete(channel.id);
      void this.ignoreRejection(() => this.verifyFeedback(channel, value, generation, configurationGeneration));
    }, channel.feedback.timeoutMs);
    this.feedbackChecks.set(channel.id, { timer, generation });
  }

  private async verifyFeedback(
    channel: LogicalChannel,
    value: boolean,
    generation: number,
    configurationGeneration: number,
  ): Promise<void> {
    if (!this.isCurrentFeedback(channel.id, generation, configurationGeneration)) return;
    const feedbackChannel = this.options.getSnapshot()?.logicalChannels.find((item) => item.id === channel.feedback?.channelId);
    const point = this.options.getSnapshot()?.physicalPoints.find((item) => item.id === feedbackChannel?.physicalPointId);
    if (!channel.feedback || !point) return;
    try {
      const actual = Boolean(await this.options.device.read(point));
      const expected = channel.feedback.expected === 'match' ? value : !value;
      if (actual !== expected && this.isCurrentFeedback(channel.id, generation, configurationGeneration))
        await this.options.publishFault(channel.id, {
          code: 'feedback_mismatch',
          message: 'configured feedback does not match the requested output state',
        });
    } catch (error) {
      if (this.isCurrentFeedback(channel.id, generation, configurationGeneration))
        await this.options.publishFault(channel.id, {
          code: 'feedback_read_failed',
          message: error instanceof Error ? error.message : String(error),
        });
    }
  }

  private isCurrentFeedback(channelId: string, generation: number, configurationGeneration: number): boolean {
    return (
      this.feedbackGenerations.get(channelId) === generation && this.configurationGeneration === configurationGeneration
    );
  }
}
