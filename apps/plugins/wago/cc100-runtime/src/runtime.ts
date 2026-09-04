import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const PROTOCOL_VERSION = 1;
export const MAX_PENDING_CHANNEL_WRITES = 100;
export const CAPABILITIES = [
  'claim',
  'heartbeat',
  'configuration-v1',
  'commands',
  'state',
  'measurement',
  'fault',
  'acknowledgement',
];

type DisconnectPolicy = { mode: 'hold' | 'immediate' | 'watchdog'; timeoutMs?: number };
export type Snapshot = {
  version: number;
  physicalPoints: Array<{ id: string; hardwareProfile: '751-9301' | '879-3000' | '879-1300'; channel: number }>;
  logicalChannels: Array<{
    id: string;
    physicalPointId: string;
    profile: string;
    capabilities: string[];
    disconnectPolicy: DisconnectPolicy;
    range?: { minimum: number; maximum: number };
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    feedback?: { channelId: string; expected: 'match' | 'inverse'; timeoutMs: number };
    measurement?: {
      unit: string;
      scale: number;
      offset: number;
      kind?: 'live' | 'cumulative';
    };
  }>;
};

export type ValidationError = { path: string; code: string; message: string };
export type RuntimeState = {
  credentials?: { username: string; password: string };
  accepted?: { revision: number; contentHash: string; snapshot: Snapshot };
  outputs: Record<string, boolean>;
  commandIds: string[];
};

export interface Transport {
  publish(topic: string, payload: unknown, options?: { retain?: boolean }): Promise<void>;
  subscribe(topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void>;
}

export interface DeviceAdapter {
  write(point: Snapshot['physicalPoints'][number], value: boolean): Promise<void>;
  read(point: Snapshot['physicalPoints'][number]): Promise<boolean | number>;
}

export class JsonStateStore {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<RuntimeState> {
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8')) as RuntimeState;
      return { outputs: {}, commandIds: [], ...state };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { outputs: {}, commandIds: [] };
      throw error;
    }
  }

  async save(state: RuntimeState): Promise<void> {
    const contents = JSON.stringify(state);
    const save = this.saveQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.next`;
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.saveQueue = save.catch(() => undefined);
    await save;
  }
}

export class WagoRuntime {
  private state: RuntimeState = { outputs: {}, commandIds: [] };
  private connected = true;
  private readonly pulses = new Map<string, { generation: number; timer: ReturnType<typeof setTimeout> }>();
  private pulseSequence = 0;
  private readonly channelWrites = new Map<string, { tail: Promise<void>; pending: number }>();
  private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly feedbackChecks = new Map<string, { timer: ReturnType<typeof setTimeout>; channelId: string; generation: number }>();
  private feedbackCheckSequence = 0;
  private readonly feedbackGenerationSequences = new Map<string, number>();
  private readonly feedbackGenerations = new Map<string, number>();
  private configurationGeneration = 0;
  private readonly inFlightCommandIds = new Set<string>();
  private measurementSequence = 0;
  private readonly measurementStreamId = randomUUID();

  constructor(
    private readonly options: { hardwareId: string; prefix: string; store: JsonStateStore; transport: Transport; device: DeviceAdapter },
  ) {}

  async start(): Promise<void> {
    this.state = await this.options.store.load();
    await this.options.transport.subscribe(this.desiredTopic(), (payload) => this.receiveDesired(payload));
    await this.options.transport.subscribe(this.commandTopic(), (payload) => this.receiveCommand(payload));
    await this.publishHeartbeat();
    await this.publishState();
  }

  async receiveClaim(credentials: { username: string; password: string }): Promise<void> {
    this.state.credentials = credentials;
    await this.options.store.save(this.state);
  }

  async receiveDesired(payload: Buffer): Promise<void> {
    let desired: { protocolVersion: number; revision: number; contentHash: string; snapshot: Snapshot };
    try {
      desired = JSON.parse(payload.toString('utf8'));
    } catch {
      return this.reportRejected(0, '', [{ path: '$', code: 'invalid_json', message: 'desired configuration is not valid JSON' }]);
    }
    const errors = validateDesired(desired);
    if (!errors.length && desired.contentHash !== hash(desired.snapshot))
      errors.push({ path: 'contentHash', code: 'hash_mismatch', message: 'content hash does not match snapshot' });
    if (errors.length) return this.reportRejected(desired.revision, desired.contentHash, errors);
    if (this.state.accepted?.revision === desired.revision && this.state.accepted.contentHash === desired.contentHash) {
      await this.publishReport(desired.revision, desired.contentHash, []);
      return;
    }
    // Persist only after validation; a rejected snapshot cannot alter active I/O.
    this.feedbackChecks.forEach(({ timer }) => clearTimeout(timer));
    this.feedbackChecks.clear();
    this.configurationGeneration += 1;
    this.state.accepted = { revision: desired.revision, contentHash: desired.contentHash, snapshot: desired.snapshot };
    await this.options.store.save(this.state);
    await this.publishReport(desired.revision, desired.contentHash, []);
    await this.publishState();
  }

  async receiveCommand(payload: Buffer): Promise<void> {
    let command: { id: string; channelId: string; action: 'set' | 'pulse'; value?: boolean };
    try {
      command = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (!command?.id || !command.channelId || !['set', 'pulse'].includes(command.action)) return;
    if (command.action === 'set' && typeof command.value !== 'boolean') return this.acknowledge(command.id, 'rejected', 'set commands require a boolean value');
    if (this.state.commandIds.includes(command.id)) return this.acknowledge(command.id, 'duplicate');
    if (this.inFlightCommandIds.has(command.id)) return this.acknowledge(command.id, 'duplicate');
    this.inFlightCommandIds.add(command.id);
    try {
      const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
      if (!channel || !channel.capabilities.includes('output')) return this.acknowledge(command.id, 'rejected', 'unknown output channel');
      if (!(await this.isGuardSatisfied(channel))) return this.acknowledge(command.id, 'rejected', 'operational guard is not satisfied');
      const duration = command.action === 'pulse' ? channel.pulse?.durationMs : undefined;
      if (command.action === 'pulse' && !duration) return this.acknowledge(command.id, 'rejected', 'channel does not define a pulse duration');

      // Keep the reservation through an unexpected exit after the physical write.
      this.state.commandIds = [...this.state.commandIds, command.id].slice(-100);
      await this.options.store.save(this.state);
      if (command.action === 'pulse') {
        const generation = this.reserveFeedbackGeneration(channel.id);
        const result = await this.writeChannel(channel, true, (configurationGeneration) => this.schedulePulse(channel, duration, generation, configurationGeneration), generation, true, undefined, true);
        if (result !== 'written') return this.rejectFailedWrite(command.id, result === 'queue_full' ? 'channel write queue is full' : undefined);
      } else {
        const result = await this.writeChannel(channel, command.value, undefined, this.reserveFeedbackGeneration(channel.id), false, undefined, true);
        if (result !== 'written') return this.rejectFailedWrite(command.id, result === 'queue_full' ? 'channel write queue is full' : undefined);
      }
      await this.acknowledge(command.id, 'accepted');
    } finally {
      this.inFlightCommandIds.delete(command.id);
    }
  }

  async setConnected(connected: boolean): Promise<void> {
    this.connected = connected;
    if (connected) {
      this.watchdogs.forEach(clearTimeout);
      this.watchdogs.clear();
      await this.publishState();
      return;
    }
    let stateSaveFailed = false;
    for (const channel of this.state.accepted?.snapshot.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (channel.disconnectPolicy.mode === 'immediate') {
        try {
          const result = await this.writeChannel(channel, false);
          if (result !== 'written') stateSaveFailed = true;
        } catch {
          // Continue the safety shutdown even when durable state cannot be updated for one output.
          stateSaveFailed = true;
        }
      }
      if (channel.disconnectPolicy.mode === 'watchdog')
        this.watchdogs.set(
          channel.id,
          setTimeout(() => void this.ignoreTimerRejection(() => this.writeChannel(channel, false)), channel.disconnectPolicy.timeoutMs),
        );
    }
    if (stateSaveFailed) await this.options.store.save(this.state);
    await this.publishState();
  }

  async publishHeartbeat(): Promise<void> {
    await this.options.transport.publish(this.topic('heartbeat'), {
      hardwareId: this.options.hardwareId,
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0',
      capabilities: CAPABILITIES,
      sequence: Date.now(),
    });
  }

  async publishMeasurements(): Promise<void> {
    const accepted = this.state.accepted;
    if (!accepted) return;
    for (const channel of accepted.snapshot.logicalChannels.filter((item) => item.capabilities.includes('measurement'))) {
      const point = accepted.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (!point) continue;
      try {
        const raw = await this.options.device.read(point);
        if (typeof raw !== 'number') continue;
        const transform = channel.measurement ?? { unit: 'percent', scale: 1, offset: 0 };
        const scaledValue = raw * transform.scale + transform.offset;
        const value = Math.round(scaledValue);
        if (!Number.isSafeInteger(value) || Math.abs(scaledValue - value) > Number.EPSILON * Math.max(1, Math.abs(scaledValue)) * 16) {
          await this.options.transport.publish(this.topic('faults'), {
            channelId: channel.id,
            code: 'invalid_measurement_transform',
            message: 'measurement transforms must produce an integer base-unit value',
          });
          continue;
        }
        await this.options.transport.publish(this.topic('measurements'), {
          channelId: channel.id,
          unit: transform.unit,
          value,
          kind: transform.kind ?? 'live',
          sourceTimestamp: new Date().toISOString(),
          streamId: this.measurementStreamId,
          sequence: ++this.measurementSequence,
        });
      } catch (error) {
        await this.options.transport.publish(this.topic('faults'), {
          channelId: channel.id,
          code: 'measurement_read_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async writeChannel(
    channel: Snapshot['logicalChannels'][number],
    value: boolean,
    onWritten?: (configurationGeneration: number) => void,
    feedbackGeneration = this.reserveFeedbackGeneration(channel.id),
    preservePulse = false,
    shouldWrite?: () => boolean,
    rejectWhenQueued = false,
    configurationGeneration = this.configurationGeneration,
  ): Promise<'written' | 'failed' | 'queue_full'> {
    return this.enqueueChannelWrite(channel.id, async () => {
      if (shouldWrite && !shouldWrite()) return 'failed';
      return this.writeChannelWhileQueued(channel, value, onWritten, feedbackGeneration, preservePulse, configurationGeneration);
    }, rejectWhenQueued);
  }

  private async writeChannelWhileQueued(
    channel: Snapshot['logicalChannels'][number],
    value: boolean,
    onWritten: ((configurationGeneration: number) => void) | undefined,
    feedbackGeneration: number,
    preservePulse: boolean,
    configurationGeneration: number,
  ): Promise<'written' | 'failed'> {
    const point = this.state.accepted?.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return 'failed';
    try {
      await this.options.device.write(point, value);
    } catch (error) {
      try {
        await this.options.transport.publish(this.topic('faults'), {
          channelId: channel.id,
          code: 'device_write_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // A fault-publication failure must not turn a known failed write into an accepted command.
      }
      return 'failed';
    }
    const feedbackIsCurrent = this.commitFeedbackGeneration(channel.id, feedbackGeneration);
    // A pulse must always arrange its physical shutoff after it is written, even
    // when a newer command has superseded its feedback generation.
    onWritten?.(configurationGeneration);
    this.state.outputs[channel.id] = value;
    if (feedbackIsCurrent && configurationGeneration === this.configurationGeneration)
      this.scheduleFeedbackCheck(channel, value, feedbackGeneration, configurationGeneration);
    try {
      await this.options.store.save(this.state);
    } catch {
      // Do not acknowledge an operation whose durable output state is stale.
      throw new Error('failed to persist channel state');
    }
    // Only an accepted newer output write cancels a pending pulse shutoff.
    if (!preservePulse) this.clearPulse(channel.id);
    try {
      await this.publishState();
    } catch {
      // Retained-state publication does not change the durable state of a successful write.
    }
    return 'written';
  }

  private schedulePulse(channel: Snapshot['logicalChannels'][number], duration: number, feedbackGeneration: number, configurationGeneration: number): void {
    this.clearPulse(channel.id);
    const generation = ++this.pulseSequence;
    const timer = setTimeout(
      () => void this.ignoreTimerRejection(() => this.writeChannel(
        channel,
        false,
        undefined,
        feedbackGeneration,
        true,
        () => {
          if (this.pulses.get(channel.id)?.generation !== generation) return false;
          this.pulses.delete(channel.id);
          return true;
        },
        false,
        configurationGeneration,
      )),
      duration,
    );
    this.pulses.set(channel.id, { generation, timer });
  }

  private clearPulse(channelId: string): void {
    const pulse = this.pulses.get(channelId);
    if (!pulse) return;
    clearTimeout(pulse.timer);
    this.pulses.delete(channelId);
  }

  private async enqueueChannelWrite<T>(channelId: string, write: () => Promise<T>, rejectWhenQueued = false): Promise<T | 'queue_full'> {
    const queue = this.channelWrites.get(channelId) ?? { tail: Promise.resolve(), pending: 0 };
    if (rejectWhenQueued && queue.pending >= MAX_PENDING_CHANNEL_WRITES) return 'queue_full';
    queue.pending += 1;
    const next = queue.tail.then(write);
    queue.tail = next.then(() => undefined, () => undefined);
    this.channelWrites.set(channelId, queue);
    void queue.tail.finally(() => {
      queue.pending -= 1;
      if (queue.pending === 0) this.channelWrites.delete(channelId);
    });
    return next;
  }
  private reserveFeedbackGeneration(channelId: string): number {
    const generation = (this.feedbackGenerationSequences.get(channelId) ?? 0) + 1;
    this.feedbackGenerationSequences.set(channelId, generation);
    return generation;
  }
  private commitFeedbackGeneration(channelId: string, generation: number): boolean {
    this.feedbackGenerations.set(channelId, generation);
    for (const [checkId, check] of this.feedbackChecks) {
      if (check.channelId === channelId && check.generation !== generation) {
        clearTimeout(check.timer);
        this.feedbackChecks.delete(checkId);
      }
    }
    return true;
  }
  private scheduleFeedbackCheck(channel: Snapshot['logicalChannels'][number], value: boolean, generation: number, configurationGeneration: number): void {
    if (!channel.feedback) return;
    const checkId = `${channel.id}:${++this.feedbackCheckSequence}`;
    const timer = setTimeout(() => {
      this.feedbackChecks.delete(checkId);
      void this.ignoreTimerRejection(() => this.verifyFeedback(channel, value, generation, configurationGeneration));
    }, channel.feedback.timeoutMs);
    this.feedbackChecks.set(checkId, { timer, channelId: channel.id, generation });
  }
  private async verifyFeedback(channel: Snapshot['logicalChannels'][number], value: boolean, generation: number, configurationGeneration: number): Promise<void> {
    if (this.feedbackGenerations.get(channel.id) !== generation || this.configurationGeneration !== configurationGeneration) return;
    const feedback = channel.feedback;
    const snapshot = this.state.accepted?.snapshot;
    const feedbackChannel = snapshot?.logicalChannels.find((item) => item.id === feedback?.channelId);
    const point = snapshot?.physicalPoints.find((item) => item.id === feedbackChannel?.physicalPointId);
    if (!feedback || !point) return;
    try {
      const actual = Boolean(await this.options.device.read(point));
      const expected = feedback.expected === 'match' ? value : !value;
      if (actual !== expected && this.feedbackGenerations.get(channel.id) === generation && this.configurationGeneration === configurationGeneration)
        await this.options.transport.publish(this.topic('faults'), {
          channelId: channel.id,
          code: 'feedback_mismatch',
          message: 'configured feedback does not match the requested output state',
        });
    } catch (error) {
      if (this.feedbackGenerations.get(channel.id) !== generation || this.configurationGeneration !== configurationGeneration) return;
      await this.options.transport.publish(this.topic('faults'), {
        channelId: channel.id,
        code: 'feedback_read_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async publishState(): Promise<void> {
    await this.options.transport.publish(this.topic('state'), {
      connected: this.connected,
      revision: this.state.accepted?.revision ?? null,
      contentHash: this.state.accepted?.contentHash ?? null,
      outputs: this.state.outputs,
    }, { retain: true });
  }
  private publishReport(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.options.transport.publish(this.topic('configuration/reported'), { revision, contentHash, errors }, { retain: true });
  }
  private reportRejected(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.publishReport(revision, contentHash, errors);
  }
  private acknowledge(id: string, status: 'accepted' | 'duplicate' | 'rejected', error?: string): Promise<void> {
    return this.options.transport.publish(this.topic('acknowledgements'), { id, status, error });
  }
  private topic(suffix: string): string {
    return `${this.options.prefix.replace(/^\/+|\/+$/g, '')}/v1/controllers/${this.options.hardwareId}/${suffix}`;
  }
  private desiredTopic(): string { return this.topic('configuration/desired'); }
  private commandTopic(): string { return this.topic('commands'); }
  private async isGuardSatisfied(channel: Snapshot['logicalChannels'][number]): Promise<boolean> {
    if (!channel.guard) return true;
    const snapshot = this.state.accepted?.snapshot;
    const guardChannel = snapshot?.logicalChannels.find((item) => item.id === channel.guard?.channelId);
    const guardPoint = snapshot?.physicalPoints.find((item) => item.id === guardChannel?.physicalPointId);
    if (!guardPoint) return false;
    try {
      return Boolean(await this.options.device.read(guardPoint)) === (channel.guard.when === 'on');
    } catch {
      return false;
    }
  }
  private async rejectFailedWrite(id: string, error = 'device write failed'): Promise<void> {
    this.state.commandIds = this.state.commandIds.filter((commandId) => commandId !== id);
    await this.options.store.save(this.state);
    await this.acknowledge(id, 'rejected', error);
  }
  private ignoreTimerRejection(callback: () => Promise<unknown>): void {
    void callback().catch(() => undefined);
  }
}

export function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}

export function validateDesired(value: unknown): ValidationError[] {
  if (!value || typeof value !== 'object') return [{ path: '$', code: 'invalid_snapshot', message: 'desired configuration must be an object' }];
  const desired = value as Record<string, unknown>;
  const errors: ValidationError[] = [];
  if (desired.protocolVersion !== PROTOCOL_VERSION) errors.push({ path: 'protocolVersion', code: 'unsupported_version', message: 'protocolVersion must be 1' });
  if (!Number.isSafeInteger(desired.revision) || (desired.revision as number) < 1) errors.push({ path: 'revision', code: 'invalid_revision', message: 'revision must be a positive integer' });
  if (typeof desired.contentHash !== 'string') errors.push({ path: 'contentHash', code: 'invalid_hash', message: 'contentHash is required' });
  errors.push(...validateSnapshot(desired.snapshot));
  return errors;
}

export function validateSnapshot(value: unknown): ValidationError[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ path: 'snapshot', code: 'invalid_snapshot', message: 'snapshot must be an object' }];
  const snapshot = value as Partial<Snapshot>;
  const errors: ValidationError[] = [];
  validateKeys(snapshot as Record<string, unknown>, 'snapshot', ['version', 'physicalPoints', 'logicalChannels'], errors);
  if (snapshot.version !== 1) errors.push({ path: 'snapshot.version', code: 'unsupported_version', message: 'snapshot version must be 1' });
  if (!Array.isArray(snapshot.physicalPoints) || !Array.isArray(snapshot.logicalChannels)) return [...errors, { path: 'snapshot', code: 'invalid_collection', message: 'physicalPoints and logicalChannels must be arrays' }];
  const pointIds = new Set<string>();
  snapshot.physicalPoints.forEach((point, index) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      errors.push({ path: `snapshot.physicalPoints[${index}]`, code: 'invalid_object', message: 'physical point must be an object' });
      return;
    }
    validateKeys(point as Record<string, unknown>, `snapshot.physicalPoints[${index}]`, ['id', 'hardwareProfile', 'channel'], errors);
    if (!point?.id || pointIds.has(point.id)) errors.push({ path: `snapshot.physicalPoints[${index}].id`, code: 'invalid_id', message: 'physical point IDs must be unique' });
    pointIds.add(point?.id);
    if (!['751-9301', '879-3000', '879-1300'].includes(point?.hardwareProfile ?? '')) errors.push({ path: `snapshot.physicalPoints[${index}].hardwareProfile`, code: 'unsupported_profile', message: 'unsupported hardware profile' });
    if (!Number.isSafeInteger(point?.channel) || (point?.channel ?? -1) < 0) errors.push({ path: `snapshot.physicalPoints[${index}].channel`, code: 'invalid_channel', message: 'channel must be non-negative' });
  });
  const channelIds = new Set<string>();
  const channelsById = new Map<string, Snapshot['logicalChannels'][number]>();
  const channelIdCounts = new Map<string, number>();
  snapshot.logicalChannels.forEach((channel) => {
    if (typeof channel?.id !== 'string') return;
    channelIds.add(channel.id);
    channelsById.set(channel.id, channel);
    channelIdCounts.set(channel.id, (channelIdCounts.get(channel.id) ?? 0) + 1);
  });
  snapshot.logicalChannels.forEach((channel, index) => {
    const path = `snapshot.logicalChannels[${index}]`;
    if (!channel || typeof channel !== 'object' || Array.isArray(channel)) {
      errors.push({ path, code: 'invalid_object', message: 'logical channel must be an object' });
      return;
    }
    validateKeys(channel as Record<string, unknown>, path, ['id', 'physicalPointId', 'profile', 'capabilities', 'disconnectPolicy', 'range', 'pulse', 'guard', 'feedback', 'measurement'], errors);
    if (!channel?.id || channelIdCounts.get(channel.id) !== 1) errors.push({ path: `${path}.id`, code: 'invalid_id', message: 'logical channel IDs must be unique' });
    if (!pointIds.has(channel?.physicalPointId ?? '')) errors.push({ path: `${path}.physicalPointId`, code: 'missing_reference', message: 'physical point does not exist' });
    const capabilities = Array.isArray(channel?.capabilities) ? channel.capabilities : [];
    if (!capabilities.length) errors.push({ path: `${path}.capabilities`, code: 'invalid_capabilities', message: 'capabilities are required' });
    if (capabilities.some((capability, capabilityIndex) => !['output', 'input', 'measurement', 'pulse', 'guard', 'feedback'].includes(capability) || capabilities.indexOf(capability) !== capabilityIndex))
      errors.push({ path: `${path}.capabilities`, code: 'invalid_capabilities', message: 'capabilities must be unique supported values' });
    if (typeof channel.profile !== 'string' || !channel.profile.trim())
      errors.push({ path: `${path}.profile`, code: 'invalid_profile', message: 'logical channel profile must be a non-empty string' });
    const policy = channel?.disconnectPolicy;
    if (!policy || !['hold', 'immediate', 'watchdog'].includes(policy.mode) || (policy.mode === 'watchdog' && (!Number.isSafeInteger(policy.timeoutMs) || (policy.timeoutMs ?? 0) <= 0))) errors.push({ path: `${path}.disconnectPolicy`, code: 'invalid_disconnect_policy', message: 'every channel needs hold, immediate, or watchdog disconnect behavior' });
    if (channel?.pulse && (!capabilities.includes('pulse') || !Number.isSafeInteger(channel.pulse.durationMs) || channel.pulse.durationMs <= 0)) errors.push({ path: `${path}.pulse`, code: 'invalid_pulse', message: 'pulse requires pulse capability and positive duration' });
    if (channel?.pulse) validateKeys(channel.pulse as Record<string, unknown>, `${path}.pulse`, ['durationMs'], errors);
    if (channel?.guard && (!capabilities.includes('guard') || !channelIds.has(channel.guard.channelId))) errors.push({ path: `${path}.guard`, code: 'invalid_guard', message: 'guard requires guard capability and an existing channel' });
    if (channel?.guard) validateKeys(channel.guard as Record<string, unknown>, `${path}.guard`, ['channelId', 'when'], errors);
    const feedbackChannel = channel?.feedback ? channelsById.get(channel.feedback.channelId) : undefined;
    if (
      channel?.feedback &&
      (!capabilities.includes('feedback') ||
        !feedbackChannel ||
        feedbackChannel.id === channel.id ||
        !Array.isArray(feedbackChannel.capabilities) ||
        !feedbackChannel.capabilities.includes('input') ||
        !['match', 'inverse'].includes(channel.feedback.expected) ||
        !Number.isSafeInteger(channel.feedback.timeoutMs) ||
        channel.feedback.timeoutMs <= 0)
    )
      errors.push({ path: `${path}.feedback`, code: 'invalid_feedback', message: 'feedback requires feedback capability, a channel, expectation, and positive timeout' });
    if (channel?.feedback) validateKeys(channel.feedback as Record<string, unknown>, `${path}.feedback`, ['channelId', 'expected', 'timeoutMs'], errors);
    if (channel?.range && (!['input', 'measurement'].some((capability) => capabilities.includes(capability)) || !Number.isFinite(channel.range.minimum) || !Number.isFinite(channel.range.maximum) || channel.range.minimum >= channel.range.maximum))
      errors.push({ path: `${path}.range`, code: 'invalid_range', message: 'range requires input or measurement capability and finite ordered values' });
    if (channel?.range) validateKeys(channel.range as Record<string, unknown>, `${path}.range`, ['minimum', 'maximum'], errors);
    if (channel?.measurement && (!capabilities.includes('measurement') || !['ampere', 'volt', 'watt', 'watt-hour', 'percent'].includes(channel.measurement.unit) || !Number.isFinite(channel.measurement.scale) || !Number.isFinite(channel.measurement.offset) || (channel.measurement.kind !== undefined && !['live', 'cumulative'].includes(channel.measurement.kind))))
      errors.push({ path: `${path}.measurement`, code: 'invalid_measurement', message: 'measurement requires capability, supported unit, finite transform, and a valid kind' });
    if (channel?.measurement) validateKeys(channel.measurement as Record<string, unknown>, `${path}.measurement`, ['unit', 'scale', 'offset', 'kind'], errors);
  });
  return errors;
}

function validateKeys(value: Record<string, unknown>, path: string, allowed: string[], errors: ValidationError[]): void {
  Object.keys(value).filter((key) => !allowed.includes(key)).forEach((key) => errors.push({ path: `${path}.${key}`, code: 'unknown_field', message: 'field is not supported by configuration version 1' }));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
}
