import { WriteAdmissionError, type DeviceAdapter, type RuntimeState, type Snapshot } from './runtime-types';

type LogicalChannel = Snapshot['logicalChannels'][number];
type PhysicalPoint = Snapshot['physicalPoints'][number];
type Pulse = { timer: ReturnType<typeof setTimeout>; channel: LogicalChannel; point: PhysicalPoint };

const INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS = 100;
const MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS = 5_000;

export const MAX_PENDING_CHANNEL_WRITES = 100;

export class OutputController {
  private readonly uncertainWrites = new Set<string>();
  private readonly pendingCommands = new Map<string, number>();
  private disconnected = false;
  private outageGeneration = 0;

  get busy(): boolean {
    return Boolean(this.commandOperations.size || this.channelWrites.size || this.pulses.size);
  }

  isWriteUncertain(channelId: string): boolean {
    return this.uncertainWrites.has(channelId);
  }
  private readonly pulses = new Map<string, Pulse>();
  private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly channelWrites = new Map<string, Promise<void>>();
  private readonly feedbackChecks = new Map<string, { timer: ReturnType<typeof setTimeout>; generation: number }>();
  private readonly feedbackGenerations = new Map<string, number>();
  private readonly commandOperations = new Set<Promise<void>>();
  private feedbackGenerationSequence = 0;
  private configurationGeneration = 0;
  private replacement?: Promise<void>;

  constructor(
    private readonly options: {
      device: DeviceAdapter;
      getSnapshot: () => Snapshot | undefined;
      getState: () => RuntimeState;
      saveState: () => Promise<void>;
      publishState: () => void;
      publishFault: (channelId: string, error: unknown) => Promise<void>;
    },
  ) {}

  async replaceConfiguration<T>(commit: () => Promise<T>): Promise<T> {
    let releaseReplacement!: () => void;
    this.replacement = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });

    try {
      await Promise.all(this.commandOperations);
      await Promise.all([...this.channelWrites.values()]);
      const pulses = [...this.pulses.entries()];
      let shutdownFailed = false;
      await Promise.all(
        pulses.map(async ([channelId, pulse]) => {
          clearTimeout(pulse.timer);
          try {
            const stopped = await this.runForChannel(channelId, () =>
              this.writePulseShutdown(pulse.channel, pulse.point),
            );
            if (stopped && this.pulses.get(channelId) === pulse) this.pulses.delete(channelId);
            else shutdownFailed = true;
          } catch {
            shutdownFailed = true;
          }
        }),
      );
      if (shutdownFailed) {
        pulses.forEach(([channelId, pulse]) => {
          if (this.pulses.get(channelId) === pulse) this.retryPulseShutdown(channelId, pulse, 1);
        });
        throw new Error('failed to de-energize active pulse');
      }
      this.configurationGeneration += 1;
      this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
      this.feedbackChecks.clear();
      return await commit();
    } finally {
      this.replacement = undefined;
      releaseReplacement();
    }
  }

  async runForCommand<T>(channelId: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.pendingCommands.get(channelId) ?? 0;
    if (pending >= MAX_PENDING_CHANNEL_WRITES) throw new Error('channel write queue is full');
    this.pendingCommands.set(channelId, pending + 1);
    while (this.replacement) await this.replacement;
    let release!: () => void;
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.commandOperations.add(completion);
    try {
      return await this.runForChannel(channelId, operation);
    } finally {
      this.pendingCommands.set(channelId, (this.pendingCommands.get(channelId) ?? 1) - 1);
      this.commandOperations.delete(completion);
      release();
    }
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
    admit?: () => void,
    pulseDuration?: number,
  ): Promise<boolean> {
    const configurationGeneration = this.configurationGeneration;
    const point = this.options.getSnapshot()?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return false;
    return this.writePointWhileQueued(
      channel,
      point,
      value,
      onWritten,
      onCommitted,
      configurationGeneration,
      admit,
      pulseDuration,
    );
  }

  private async writePointWhileQueued(
    channel: LogicalChannel,
    point: PhysicalPoint,
    value: boolean,
    onWritten?: () => void,
    onCommitted?: () => void,
    configurationGeneration = this.configurationGeneration,
    admit?: () => void,
    pulseDuration?: number,
  ): Promise<boolean> {
    this.uncertainWrites.delete(channel.id);
    const state = this.options.getState();
    const wasUncertain = state.uncertainOutputChannelIds?.includes(channel.id);
    const hadPulse = state.pendingPulseChannelIds?.includes(channel.id);
    if (pulseDuration)
      state.pendingPulseChannelIds = [...new Set([...(state.pendingPulseChannelIds ?? []), channel.id])];
    if (this.options.device.prepareConfiguration) {
      this.options.getState().uncertainOutputChannelIds = [
        ...new Set([...(this.options.getState().uncertainOutputChannelIds ?? []), channel.id]),
      ];
    }
    if (value && (this.options.device.prepareConfiguration || pulseDuration)) await this.options.saveState();
    try {
      admit?.();
      await this.options.device.write(point, value, admit);
    } catch (error) {
      if (error instanceof WriteAdmissionError) {
        if (!wasUncertain)
          state.uncertainOutputChannelIds = (state.uncertainOutputChannelIds ?? []).filter((id) => id !== channel.id);
        if (!hadPulse)
          state.pendingPulseChannelIds = (state.pendingPulseChannelIds ?? []).filter((id) => id !== channel.id);
        await this.options.saveState();
        throw error;
      }
      if (this.options.device.writeMayHaveBeenTransmitted?.(error)) {
        this.uncertainWrites.add(channel.id);
        // An ambiguous ON may still have energized the relay: arrange pulse shutdown.
        onWritten?.();
      }
      // Neither a fault ack nor an offline broker may delay retrying a failed shutoff.
      void this.options.publishFault(channel.id, error).catch(() => undefined);
      return false;
    }
    onWritten?.();
    this.options.getState().outputs = { ...this.options.getState().outputs, [channel.id]: value };
    // Feedback follows confirmed hardware state. Disk persistence may stall while a
    // pulse shuts off; the old ON check must not survive that physical transition.
    if (configurationGeneration === this.configurationGeneration) this.scheduleFeedbackCheck(channel, value);
    if (this.options.device.prepareConfiguration)
      this.options.getState().uncertainOutputChannelIds = (
        this.options.getState().uncertainOutputChannelIds ?? []
      ).filter((id) => id !== channel.id);
    const pendingPulses = state.pendingPulseChannelIds;
    if (!pulseDuration && pendingPulses) state.pendingPulseChannelIds = pendingPulses.filter((id) => id !== channel.id);
    try {
      await this.options.saveState();
    } catch {
      if (pendingPulses?.includes(channel.id))
        state.pendingPulseChannelIds = [...new Set([...(state.pendingPulseChannelIds ?? []), channel.id])];
      if (this.options.device.prepareConfiguration)
        this.options.getState().uncertainOutputChannelIds = [
          ...new Set([...(this.options.getState().uncertainOutputChannelIds ?? []), channel.id]),
        ];
      // Do not acknowledge an operation whose durable output state is stale.
      throw new Error('failed to persist channel state');
    }
    onCommitted?.();
    // Telemetry must not hold the physical channel queue: a pending MQTT ack
    // could otherwise prevent the pulse timer or disconnect policy from writing off.
    this.options.publishState();
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
    const point = this.options.getSnapshot()?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return;
    const existingPulse = this.pulses.get(channel.id);
    if (existingPulse) clearTimeout(existingPulse.timer);
    const pulse: Pulse = {
      channel,
      point,
      timer: setTimeout(
        () =>
          void this.ignoreRejection(() =>
            this.runForChannel(channel.id, async () => {
              if (this.pulses.get(channel.id) !== pulse) return;
              if (await this.writePulseShutdown(channel, point)) this.pulses.delete(channel.id);
              else this.retryPulseShutdown(channel.id, pulse, 1);
            }),
          ),
        duration,
      ),
    };
    this.pulses.set(channel.id, pulse);
  }

  recoverPulses(): void {
    for (const id of this.options.getState().pendingPulseChannelIds ?? []) {
      const channel = this.options.getSnapshot()?.logicalChannels.find((item) => item.id === id);
      if (!channel?.capabilities.includes('output')) throw new Error('persisted pulse has no output route');
      this.schedulePulse(channel, 0);
    }
  }

  clearPulse(channelId: string): void {
    const pulse = this.pulses.get(channelId);
    if (!pulse) return;
    clearTimeout(pulse.timer);
    this.pulses.delete(channelId);
  }

  async applyDisconnectPolicies(connected: boolean): Promise<void> {
    if (connected) {
      this.disconnected = false;
      this.outageGeneration++;
      this.watchdogs.forEach(clearTimeout);
      this.watchdogs.clear();
      return;
    }
    if (this.disconnected) return;
    this.disconnected = true;
    const disconnectedAt = Date.now();
    const outage = ++this.outageGeneration;
    const admit = () => {
      if (!this.disconnected || outage !== this.outageGeneration) throw new WriteAdmissionError('outage_ended');
    };
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
            () => {
              this.watchdogs.delete(channel.id);
              void this.ignoreRejection(() =>
                this.runForChannel(channel.id, async () => {
                  admit();
                  return this.writeWhileQueued(channel, false, undefined, undefined, admit);
                }),
              );
            },
            Math.max(0, channel.disconnectPolicy.timeoutMs - (Date.now() - disconnectedAt)),
          ),
        );
    }
    if (stateSaveFailed) await this.options.saveState();
  }

  private ignoreRejection(callback: () => Promise<unknown>): void {
    void callback().catch(() => undefined);
  }

  private async writePulseShutdown(channel: LogicalChannel, point: PhysicalPoint): Promise<boolean> {
    try {
      return await this.writePointWhileQueued(channel, point, false);
    } catch {
      // A confirmed OFF whose durable commit failed still needs a retry/recovery obligation.
      return false;
    }
  }

  private retryPulseShutdown(channelId: string, pulse: Pulse, attempt: number): void {
    // Keep the pulse so a subsequent configuration replacement cannot activate
    // a new snapshot until this captured physical point has been shut down.
    const delayMs = Math.min(
      INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS * 2 ** (attempt - 1),
      MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS,
    );
    pulse.timer = setTimeout(
      () =>
        void this.ignoreRejection(() =>
          this.runForChannel(channelId, async () => {
            if (this.pulses.get(channelId) !== pulse) return;
            if (await this.writePulseShutdown(pulse.channel, pulse.point)) this.pulses.delete(channelId);
            else this.retryPulseShutdown(channelId, pulse, attempt + 1);
          }),
        ),
      delayMs,
    );
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
    const feedbackChannel = this.options
      .getSnapshot()
      ?.logicalChannels.find((item) => item.id === channel.feedback?.channelId);
    const point = this.options
      .getSnapshot()
      ?.physicalPoints.find((item) => item.id === feedbackChannel?.physicalPointId);
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
