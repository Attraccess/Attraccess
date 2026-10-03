import { findProfile } from '../../modbus/model';
import {
  WriteAdmissionError,
  type DeviceAdapter,
  type PulseRoute,
  type RuntimeState,
  type Snapshot,
} from './runtime-types';

type LogicalChannel = Snapshot['logicalChannels'][number];
type PhysicalPoint = Snapshot['physicalPoints'][number];
type Pulse = PulseRoute & { timer: ReturnType<typeof setTimeout>; write: (value: boolean) => Promise<void> };

function routeKey(route: PulseRoute): string {
  const { point, snapshot } = route;
  if (!point.modbus) return JSON.stringify([point.hardwareProfile, point.channel]);
  const config = snapshot.modbus;
  const device = config?.devices.find((item) => item.id === point.modbus?.deviceId);
  const connection = config?.connections.find((item) => item.id === device?.connectionId);
  const action =
    config && device && findProfile(config, device)?.actions.find((item) => item.id === point.modbus?.actionId);
  const endpoint =
    connection?.transport === 'rtu'
      ? [connection.transport, connection.path, connection.baudRate, connection.parity, connection.stopBits]
      : connection && [connection.transport, connection.host, connection.port];
  return JSON.stringify([
    endpoint,
    device?.unitId,
    action && [
      action.functionCode,
      action.address - action.addressBase,
      action.dataType,
      action.byteOrder,
      action.wordOrder,
      action.scale,
      action.offset,
      action.onValue,
      action.offValue,
    ],
  ]);
}

const INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS = 100;
const MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS = 5_000;

export const MAX_PENDING_CHANNEL_WRITES = 100;

export class OutputRoutingBusyError extends Error {}

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

  assertConfigurationSafe(next: Snapshot): void {
    const snapshot = this.options.getSnapshot();
    const state = this.options.getState();
    for (const channel of snapshot?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (!state.outputs[channel.id] && !state.uncertainOutputChannelIds?.includes(channel.id)) continue;
      const point = snapshot?.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (!snapshot || !point) throw new OutputRoutingBusyError('switch outputs off before changing their routing');
      const key = routeKey({ channel, point, snapshot });
      if (state.pendingPulseRoutes?.some((route) => routeKey(route) === key)) continue;
      const replacement = next.logicalChannels.find(
        (item) => item.id === channel.id && item.capabilities.includes('output'),
      );
      const replacementPoint = next.physicalPoints.find((item) => item.id === replacement?.physicalPointId);
      if (
        !replacement ||
        !replacementPoint ||
        routeKey({ channel: replacement, point: replacementPoint, snapshot: next }) !== key
      )
        throw new OutputRoutingBusyError('switch outputs off before changing their routing');
    }
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
      feedbackEnabled?: () => boolean;
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
    ownership?: 'manual' | 'flow',
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
      ownership,
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
    ownership?: 'manual' | 'flow',
  ): Promise<boolean> {
    this.uncertainWrites.delete(channel.id);
    const state = this.options.getState();
    const wasUncertain = state.uncertainOutputChannelIds?.includes(channel.id);
    const snapshot = this.options.getSnapshot();
    const route = snapshot && { channel, point, snapshot };
    const key = route && routeKey(route);
    const pendingRoutes = state.pendingPulseRoutes;
    const hadPulse = state.pendingPulseChannelIds?.includes(channel.id);
    if (pulseDuration && route)
      state.pendingPulseRoutes = [...(pendingRoutes ?? []).filter((item) => routeKey(item) !== key), route];
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
        this.restorePulseRoute(key, pendingRoutes);
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
    // Output value and its command owner must share the same durable commit.
    // Safety shutoffs omit ownership so they do not pretend a flow took over.
    if (ownership !== undefined)
      state.manualOutputChannelIds = [
        ...(state.manualOutputChannelIds ?? []).filter((id) => id !== channel.id),
        ...(ownership === 'manual' ? [channel.id] : []),
      ];
    // Feedback follows confirmed hardware state. Disk persistence may stall while a
    // pulse shuts off; the old ON check must not survive that physical transition.
    if (configurationGeneration === this.configurationGeneration) this.scheduleFeedbackCheck(channel, value);
    if (this.options.device.prepareConfiguration)
      this.options.getState().uncertainOutputChannelIds = (
        this.options.getState().uncertainOutputChannelIds ?? []
      ).filter((id) => id !== channel.id);
    const pendingPulses = state.pendingPulseChannelIds;
    if (!pulseDuration) {
      state.pendingPulseRoutes = state.pendingPulseRoutes?.filter((item) => routeKey(item) !== key);
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes?.map((route) => route.channel.id) ?? [])];
    }
    try {
      await this.options.saveState();
    } catch {
      if (!pulseDuration) this.restorePulseRoute(key, pendingRoutes);
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
      const value = Boolean(await this.options.device.read(guardPoint));
      return (guardChannel?.invert ? !value : value) === (channel.guard.when === 'on');
    } catch {
      return false;
    }
  }

  schedulePulse(channel: LogicalChannel, duration: number, captured?: PulseRoute): void {
    const snapshot = captured?.snapshot ?? this.options.getSnapshot();
    const point = captured?.point ?? snapshot?.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point || !snapshot) return;
    const route = captured ?? { channel, point, snapshot };
    const key = routeKey(route);
    const existingPulse = this.pulses.get(key);
    if (existingPulse) clearTimeout(existingPulse.timer);
    const pulse: Pulse = {
      ...route,
      write:
        this.options.device.captureWrite?.(point, snapshot) ?? ((value) => this.options.device.write(point, value)),
      timer: setTimeout(() => this.completePulse(key, pulse, 1), duration),
    };
    this.pulses.set(key, pulse);
  }

  recoverPulses(): void {
    const state = this.options.getState();
    const routes = [...(state.pendingPulseRoutes ?? [])];
    for (const id of state.pendingPulseChannelIds ?? []) {
      if (routes.some((route) => route.channel.id === id)) continue;
      const snapshot = this.options.getSnapshot();
      const channel = snapshot?.logicalChannels.find((item) => item.id === id);
      const point = snapshot?.physicalPoints.find((item) => item.id === channel?.physicalPointId);
      if (!snapshot || !channel?.capabilities.includes('output') || !point)
        throw new Error('persisted pulse has no output route');
      routes.push({ channel, point, snapshot });
    }
    state.pendingPulseRoutes = routes;
    for (const route of routes) this.schedulePulse(route.channel, 0, route);
  }

  clearPulse(channelId: string): void {
    const snapshot = this.options.getSnapshot();
    const channel = snapshot?.logicalChannels.find((item) => item.id === channelId);
    const point = snapshot?.physicalPoints.find((item) => item.id === channel?.physicalPointId);
    if (!snapshot || !channel || !point) return;
    const key = routeKey({ channel, point, snapshot });
    const pulse = this.pulses.get(key);
    if (!pulse) return;
    clearTimeout(pulse.timer);
    this.pulses.delete(key);
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
          setTimeout(() => {
            this.watchdogs.delete(channel.id);
            void this.ignoreRejection(() =>
              this.runForChannel(channel.id, async () => {
                admit();
                return this.writeWhileQueued(channel, false, undefined, undefined, admit);
              }),
            );
          }, channel.disconnectPolicy.timeoutMs),
        );
    }
    if (stateSaveFailed) await this.options.saveState();
  }

  /** Runtime updates override hold/watchdog policies and manual ownership. */
  async applyRuntimeUpdateFailsafe(): Promise<void> {
    this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
    this.feedbackChecks.clear();
    this.feedbackGenerations.clear();
    this.watchdogs.forEach(clearTimeout);
    this.watchdogs.clear();
    this.options.getState().manualOutputChannelIds = [];
    let failed = false;
    for (const channel of this.options.getSnapshot()?.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      try {
        if (await this.write(channel, false)) this.clearPulse(channel.id);
        else failed = true;
      } catch {
        failed = true;
      }
    }
    for (const [key, pulse] of this.pulses) {
      await this.runForChannel(pulse.channel.id, async () => {
        if (this.pulses.get(key) !== pulse) return;
        if (await this.writePulseShutdown(pulse)) {
          clearTimeout(pulse.timer);
          this.pulses.delete(key);
        } else failed = true;
      });
    }
    if (failed) throw new Error('Runtime update could not switch every output off');
  }

  private ignoreRejection(callback: () => Promise<unknown>): void {
    void callback().catch(() => undefined);
  }

  private completePulse(key: string, pulse: Pulse, attempt: number): void {
    this.ignoreRejection(() =>
      this.runForChannel(pulse.channel.id, async () => {
        if (this.pulses.get(key) !== pulse) return;
        if (await this.writePulseShutdown(pulse)) this.pulses.delete(key);
        else {
          const delayMs = Math.min(
            INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS * 2 ** (attempt - 1),
            MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS,
          );
          pulse.timer = setTimeout(() => this.completePulse(key, pulse, attempt + 1), delayMs);
        }
      }),
    );
  }

  private async writePulseShutdown(pulse: Pulse): Promise<boolean> {
    const key = routeKey(pulse);
    const state = this.options.getState();
    const route = state.pendingPulseRoutes?.find((route) => routeKey(route) === key) ?? {
      channel: pulse.channel,
      point: pulse.point,
      snapshot: pulse.snapshot,
    };
    try {
      await pulse.write(false);
      const snapshot = this.options.getSnapshot();
      const channel = snapshot?.logicalChannels.find((item) => {
        const point = snapshot.physicalPoints.find((point) => point.id === item.physicalPointId);
        return point && item.capabilities.includes('output') && routeKey({ channel: item, point, snapshot }) === key;
      });
      if (channel) {
        state.outputs = { ...state.outputs, [channel.id]: false };
        state.uncertainOutputChannelIds = state.uncertainOutputChannelIds?.filter((id) => id !== channel.id);
        this.scheduleFeedbackCheck(channel, false);
      }
      state.pendingPulseRoutes = state.pendingPulseRoutes?.filter((route) => routeKey(route) !== key);
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes?.map((route) => route.channel.id) ?? [])];
      await this.options.saveState();
      this.options.publishState();
      return true;
    } catch (error) {
      if (!state.pendingPulseRoutes?.some((route) => routeKey(route) === key))
        state.pendingPulseRoutes = [...(state.pendingPulseRoutes ?? []), route];
      state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes.map((route) => route.channel.id))];
      void this.options.publishFault(pulse.channel.id, error).catch(() => undefined);
      return false;
    }
  }

  private restorePulseRoute(key: string | undefined, previous: PulseRoute[] | undefined): void {
    if (!key) return;
    const state = this.options.getState();
    const route = previous?.find((route) => routeKey(route) === key);
    state.pendingPulseRoutes = [
      ...(state.pendingPulseRoutes ?? []).filter((route) => routeKey(route) !== key),
      ...(route ? [route] : []),
    ];
    state.pendingPulseChannelIds = [...new Set(state.pendingPulseRoutes.map((route) => route.channel.id))];
  }

  private scheduleFeedbackCheck(channel: LogicalChannel, value: boolean): void {
    if (!channel.feedback || this.options.feedbackEnabled?.() === false) return;
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
    if (
      this.options.feedbackEnabled?.() === false ||
      !this.isCurrentFeedback(channel.id, generation, configurationGeneration)
    )
      return;
    const feedbackChannel = this.options
      .getSnapshot()
      ?.logicalChannels.find((item) => item.id === channel.feedback?.channelId);
    const point = this.options
      .getSnapshot()
      ?.physicalPoints.find((item) => item.id === feedbackChannel?.physicalPointId);
    if (!channel.feedback || !point) return;
    try {
      const readValue = Boolean(await this.options.device.read(point));
      const actual = feedbackChannel?.invert ? !readValue : readValue;
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
