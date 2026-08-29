import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const PROTOCOL_VERSION = 1;
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
    pulse?: { durationMs: number };
    guard?: { channelId: string; when: 'on' | 'off' };
    measurement?: { unit: string; scale: number; offset: number };
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
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.next`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export class WagoRuntime {
  private state: RuntimeState = { outputs: {}, commandIds: [] };
  private connected = true;
  private readonly pulses = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

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
    const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
    if (!channel || !channel.capabilities.includes('output')) return this.acknowledge(command.id, 'rejected', 'unknown output channel');
    // Reserve the ID before any I/O so simultaneous deliveries cannot actuate twice.
    this.state.commandIds = [...this.state.commandIds, command.id].slice(-100);
    await this.options.store.save(this.state);
    if (!(await this.isGuardSatisfied(channel))) return this.acknowledge(command.id, 'rejected', 'operational guard is not satisfied');
    if (command.action === 'pulse') {
      const duration = channel.pulse?.durationMs;
      if (!duration) return this.acknowledge(command.id, 'rejected', 'channel does not define a pulse duration');
      if (!(await this.writeChannel(channel, true))) return this.acknowledge(command.id, 'rejected', 'device write failed');
      const existingPulse = this.pulses.get(channel.id);
      if (existingPulse) clearTimeout(existingPulse);
      this.pulses.set(channel.id, setTimeout(() => void this.ignoreTimerRejection(() => this.writeChannel(channel, false)), duration));
    } else if (!(await this.writeChannel(channel, command.value))) return this.acknowledge(command.id, 'rejected', 'device write failed');
    await this.acknowledge(command.id, 'accepted');
  }

  async setConnected(connected: boolean): Promise<void> {
    this.connected = connected;
    if (connected) {
      this.watchdogs.forEach(clearTimeout);
      this.watchdogs.clear();
      await this.publishState();
      return;
    }
    for (const channel of this.state.accepted?.snapshot.logicalChannels ?? []) {
      if (!channel.capabilities.includes('output')) continue;
      if (channel.disconnectPolicy.mode === 'immediate') await this.writeChannel(channel, false);
      if (channel.disconnectPolicy.mode === 'watchdog')
        this.watchdogs.set(
          channel.id,
          setTimeout(() => void this.ignoreTimerRejection(() => this.writeChannel(channel, false)), channel.disconnectPolicy.timeoutMs),
        );
    }
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
        await this.options.transport.publish(this.topic('measurements'), {
          channelId: channel.id,
          unit: transform.unit,
          value: raw * transform.scale + transform.offset,
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

  private async writeChannel(channel: Snapshot['logicalChannels'][number], value: boolean): Promise<boolean> {
    const point = this.state.accepted?.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
    if (!point) return false;
    try {
      await this.options.device.write(point, value);
      this.state.outputs[channel.id] = value;
      await this.options.store.save(this.state);
      await this.publishState();
      return true;
    } catch (error) {
      await this.options.transport.publish(this.topic('faults'), {
        channelId: channel.id,
        code: 'device_write_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
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
  if (snapshot.version !== 1) errors.push({ path: 'snapshot.version', code: 'unsupported_version', message: 'snapshot version must be 1' });
  if (!Array.isArray(snapshot.physicalPoints) || !Array.isArray(snapshot.logicalChannels)) return [...errors, { path: 'snapshot', code: 'invalid_collection', message: 'physicalPoints and logicalChannels must be arrays' }];
  const pointIds = new Set<string>();
  snapshot.physicalPoints.forEach((point, index) => {
    if (!point?.id || pointIds.has(point.id)) errors.push({ path: `snapshot.physicalPoints[${index}].id`, code: 'invalid_id', message: 'physical point IDs must be unique' });
    pointIds.add(point?.id);
    if (!['751-9301', '879-3000', '879-1300'].includes(point?.hardwareProfile ?? '')) errors.push({ path: `snapshot.physicalPoints[${index}].hardwareProfile`, code: 'unsupported_profile', message: 'unsupported hardware profile' });
    if (!Number.isSafeInteger(point?.channel) || (point?.channel ?? -1) < 0) errors.push({ path: `snapshot.physicalPoints[${index}].channel`, code: 'invalid_channel', message: 'channel must be non-negative' });
  });
  const channelIds = new Set<string>();
  const channelIdCounts = new Map<string, number>();
  snapshot.logicalChannels.forEach((channel) => {
    if (typeof channel?.id !== 'string') return;
    channelIds.add(channel.id);
    channelIdCounts.set(channel.id, (channelIdCounts.get(channel.id) ?? 0) + 1);
  });
  snapshot.logicalChannels.forEach((channel, index) => {
    const path = `snapshot.logicalChannels[${index}]`;
    if (!channel?.id || channelIdCounts.get(channel.id) !== 1) errors.push({ path: `${path}.id`, code: 'invalid_id', message: 'logical channel IDs must be unique' });
    if (!pointIds.has(channel?.physicalPointId ?? '')) errors.push({ path: `${path}.physicalPointId`, code: 'missing_reference', message: 'physical point does not exist' });
    const capabilities = Array.isArray(channel?.capabilities) ? channel.capabilities : [];
    if (!capabilities.length) errors.push({ path: `${path}.capabilities`, code: 'invalid_capabilities', message: 'capabilities are required' });
    const policy = channel?.disconnectPolicy;
    if (!policy || !['hold', 'immediate', 'watchdog'].includes(policy.mode) || (policy.mode === 'watchdog' && (!Number.isSafeInteger(policy.timeoutMs) || (policy.timeoutMs ?? 0) <= 0))) errors.push({ path: `${path}.disconnectPolicy`, code: 'invalid_disconnect_policy', message: 'every channel needs hold, immediate, or watchdog disconnect behavior' });
    if (channel?.pulse && (!capabilities.includes('pulse') || !Number.isSafeInteger(channel.pulse.durationMs) || channel.pulse.durationMs <= 0)) errors.push({ path: `${path}.pulse`, code: 'invalid_pulse', message: 'pulse requires pulse capability and positive duration' });
    if (channel?.guard && (!capabilities.includes('guard') || !channelIds.has(channel.guard.channelId))) errors.push({ path: `${path}.guard`, code: 'invalid_guard', message: 'guard requires guard capability and an existing channel' });
  });
  return errors;
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]));
}
