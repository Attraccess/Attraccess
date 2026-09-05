import { hash, validateDesired } from './configuration';
import { OutputController } from './output-controller';
import {
  type DeviceAdapter,
  type RuntimeState,
  type Snapshot,
  type StateStore,
  type Transport,
  type ValidationError,
} from './runtime-types';

export { PROTOCOL_VERSION, hash, validateDesired, validateSnapshot } from './configuration';
export { JsonStateStore } from './state-store';
export type { DeviceAdapter, RuntimeState, Snapshot, Transport, ValidationError } from './runtime-types';

export type DiscoveryClaim = { username: string; password: string; prefix?: string };

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

export class WagoRuntime {
  private state: RuntimeState = { outputs: {}, commandIds: [], commandExpiries: {} };
  private connected = true;
  private readonly inFlightCommandIds = new Set<string>();
  private readonly outputs: OutputController;
  private configurationUpdates = Promise.resolve();
  private statePublication?: Promise<void>;
  private stateRefreshRequested = false;
  private forceStateRefresh = false;
  private operationalPublications = Promise.resolve();
  private statePersistence = Promise.resolve();
  private lastPublishedState?: string;
  private polling = false;
  private publishingHeartbeat = false;
  private sequence = 0;
  private reservedSequence = 0;
  private readonly pendingFaults = new Set<string>();

  constructor(
    private readonly options: {
      hardwareId: string;
      prefix: string;
      pairingCode: string;
      enrollmentSecret?: string;
      store: StateStore;
      transport: Transport;
      device: DeviceAdapter;
    },
  ) {
    this.outputs = new OutputController({
      device: options.device,
      getSnapshot: () => this.state.accepted?.snapshot,
      getState: () => this.state,
      saveState: () => this.saveState(),
      publishState: () => this.requestStatePublication(),
      publishFault: (channelId, error) => this.publishFault(channelId, error),
    });
  }

  async start(): Promise<void> {
    this.state = await this.options.store.load();
    this.sequence = this.state.sequence ?? 0;
    this.reservedSequence = this.sequence;
    await this.options.transport.subscribe(this.desiredTopic(), (payload) => this.receiveDesired(payload));
    await this.options.transport.subscribe(this.commandTopic(), (payload) => this.receiveCommand(payload));
    await this.publishHeartbeat();
  }

  async receiveClaim(credentials: DiscoveryClaim): Promise<void> {
    this.state.credentials = credentials;
    await this.saveState();
  }

  async receiveDiscoveryClaim(payload: Buffer): Promise<DiscoveryClaim | undefined> {
    let claim: unknown;
    try {
      claim = JSON.parse(payload.toString('utf8'));
    } catch {
      return undefined;
    }
    if (!claim || typeof claim !== 'object') return undefined;
    const { username, password, configuration, acknowledgementToken } = claim as Record<string, unknown>;
    if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) return undefined;
    const namespace =
      configuration && typeof configuration === 'object'
        ? (configuration as Record<string, unknown>).namespace
        : undefined;
    if (namespace !== undefined && (typeof namespace !== 'string' || !namespace)) return undefined;
    const credentials: DiscoveryClaim = {
      username,
      password,
      ...(typeof namespace === 'string' ? { prefix: namespace } : {}),
    };
    this.state = await this.options.store.load();
    await this.receiveClaim(credentials);
    if (typeof acknowledgementToken === 'string' && acknowledgementToken)
      await this.options.transport.publish(`${this.discoveryClaimTopic()}/ack`, { acknowledgementToken });
    return credentials;
  }

  publishDiscoveryAnnouncement(sequence = Date.now()): Promise<void> {
    return this.options.transport.publish(
      this.discoveryTopic(),
      {
        hardwareId: this.options.hardwareId,
        pairingCode: this.options.pairingCode,
        enrollmentSecret: this.options.enrollmentSecret,
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: CAPABILITIES,
        sequence,
      },
      { retain: true },
    );
  }

  discoveryClaimTopic(): string {
    return `${this.discoveryTopic()}/claim`;
  }
  async receiveDesired(payload: Buffer): Promise<void> {
    let desired: { protocolVersion: number; revision: number; contentHash: string; snapshot: Snapshot };
    try {
      desired = JSON.parse(payload.toString('utf8'));
    } catch {
      return this.reportRejected(0, '', [
        { path: '$', code: 'invalid_json', message: 'desired configuration is not valid JSON' },
      ]);
    }
    await this.runConfigurationUpdate(async () => {
      const errors = validateDesired(desired);
      if (!errors.length && desired.contentHash !== hash(desired.snapshot))
        errors.push({ path: 'contentHash', code: 'hash_mismatch', message: 'content hash does not match snapshot' });
      if (!errors.length) errors.push(...(this.options.device.validate?.(desired.snapshot) ?? []));
      if (errors.length) return this.reportRejected(desired.revision, desired.contentHash, errors);
      if (
        this.state.accepted?.revision === desired.revision &&
        this.state.accepted.contentHash === desired.contentHash
      ) {
        await this.publishReport(desired.revision, desired.contentHash, []);
        return;
      }
      if ((this.state.accepted?.revision ?? 0) > desired.revision)
        return this.reportRejected(desired.revision, desired.contentHash, [
          { path: 'revision', code: 'stale_revision', message: 'configuration revision is stale' },
        ]);
      // Keep the command barrier through this commit so old-revision commands cannot cross the boundary.
      try {
        await this.outputs.replaceConfiguration(async () => {
          const accepted = {
            revision: desired.revision,
            contentHash: desired.contentHash,
            snapshot: desired.snapshot,
          };
          await this.queueStateUpdate(async () => {
            await this.options.store.save({ ...this.state, accepted });
            this.state.accepted = accepted;
          });
        });
      } catch {
        return this.reportRejected(desired.revision, desired.contentHash, [
          { path: 'snapshot', code: 'pulse_shutdown_failed', message: 'failed to de-energize active pulse' },
        ]);
      }
      await this.publishReport(desired.revision, desired.contentHash, []);
      await this.publishState();
    });
  }

  async receiveCommand(payload: Buffer): Promise<void> {
    let command: {
      id: string;
      expiresAt?: unknown;
      channelId: string;
      action: 'set' | 'pulse';
      value?: boolean;
      expectedConfigurationRevision?: unknown;
    };
    try {
      command = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    if (
      typeof command?.id !== 'string' ||
      !command.id ||
      !command.channelId ||
      !['set', 'pulse'].includes(command.action)
    )
      return;
    if (command.action === 'set' && typeof command.value !== 'boolean')
      return this.acknowledge(command.id, 'rejected', 'set commands require a boolean value', 'invalid_command');
    const expiresAt = command.expiresAt;
    if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
      return this.acknowledge(command.id, 'rejected', 'command has expired', 'expired');
    const expectedConfigurationRevision = command.expectedConfigurationRevision;
    if (
      typeof expectedConfigurationRevision !== 'number' ||
      !Number.isSafeInteger(expectedConfigurationRevision) ||
      expectedConfigurationRevision <= 0
    )
      return this.acknowledge(command.id, 'rejected', 'command requires a configuration revision', 'invalid_command');
    this.pruneCommandExpiries();
    if (this.state.commandIds.includes(command.id) || this.state.commandExpiries?.[command.id])
      return this.acknowledge(command.id, 'duplicate');
    if (this.inFlightCommandIds.has(command.id)) return this.acknowledge(command.id, 'duplicate');
    this.inFlightCommandIds.add(command.id);
    try {
      if (this.state.accepted?.revision !== expectedConfigurationRevision)
        return this.acknowledge(command.id, 'rejected', 'controller configuration revision is stale', 'stale_revision');
      if (this.state.accepted && this.options.device.validate?.(this.state.accepted.snapshot).length)
        return this.acknowledge(
          command.id,
          'rejected',
          'stored configuration is unsupported by this hardware profile; publish a corrected configuration',
          'unsupported_point',
        );
      const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
      if (!channel || !channel.capabilities.includes('output'))
        return this.acknowledge(command.id, 'rejected', 'unknown output channel', 'unknown_channel');
      const duration = command.action === 'pulse' ? channel.pulse?.durationMs : undefined;
      if (command.action === 'pulse' && !duration)
        return this.acknowledge(
          command.id,
          'rejected',
          'channel does not define a pulse duration',
          'unsupported_operation',
        );

      // Keep the reservation through an unexpected exit after the physical write.
      this.state.commandIds = [...this.state.commandIds, command.id].slice(-100);
      this.state.commandExpiries = { ...this.state.commandExpiries, [command.id]: expiresAt };
      await this.saveState();
      const failure = await this.outputs.runForCommand(channel.id, async () => {
        const currentChannel = this.state.accepted?.snapshot.logicalChannels.find(
          (item) => item.id === command.channelId,
        );
        if (
          this.state.accepted?.revision !== expectedConfigurationRevision ||
          !currentChannel?.capabilities.includes('output')
        ) {
          await this.releaseCommand(command.id);
          return { error: 'controller configuration revision is stale', code: 'stale_revision' };
        }
        if (!(await this.outputs.isGuardSatisfied(currentChannel))) {
          await this.releaseCommand(command.id);
          return { error: 'operational guard is not satisfied', code: 'guard_rejected' };
        }
        if (command.action === 'pulse') {
          const currentDuration = currentChannel.pulse?.durationMs;
          if (!currentDuration) return this.releaseFailedWrite(command.id);
          if (
            !(await this.outputs.writeWhileQueued(currentChannel, true, () =>
              this.outputs.schedulePulse(currentChannel, currentDuration),
            ))
          )
            return this.releaseFailedWrite(command.id);
        } else if (
          !(await this.outputs.writeWhileQueued(currentChannel, command.value, undefined, () =>
            this.outputs.clearPulse(currentChannel.id),
          ))
        )
          return this.releaseFailedWrite(command.id);
        return undefined;
      });
      // Release the physical channel/configuration barrier before waiting on MQTT.
      await this.acknowledge(command.id, failure ? 'rejected' : 'accepted', failure?.error, failure?.code);
    } finally {
      this.inFlightCommandIds.delete(command.id);
    }
  }

  async setConnected(connected: boolean): Promise<void> {
    this.connected = connected;
    await this.outputs.applyDisconnectPolicies(connected);
    await this.publishState();
  }

  async publishHeartbeat(): Promise<void> {
    if (this.publishingHeartbeat) return;
    this.publishingHeartbeat = true;
    try {
      await this.options.transport.publish(this.topic('heartbeat'), {
        hardwareId: this.options.hardwareId,
        pairingCode: this.options.pairingCode,
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: CAPABILITIES,
        sequence: Date.now(),
      });
      await this.publishState();
    } finally {
      this.publishingHeartbeat = false;
    }
  }

  async publishMeasurements(): Promise<void> {
    const accepted = this.state.accepted;
    if (!accepted) return;
    for (const channel of accepted.snapshot.logicalChannels.filter((item) =>
      item.capabilities.includes('measurement'),
    )) {
      const point = accepted.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
      if (!point) continue;
      try {
        const raw = await this.options.device.read(point);
        if (typeof raw !== 'number') continue;
        const transform = channel.measurement ?? { unit: 'percent', scale: 1, offset: 0 };
        await this.publishOperational('measurements', {
          channelId: channel.id,
          unit: transform.unit,
          value: raw * transform.scale + transform.offset,
        });
      } catch (error) {
        await this.publishOperational('faults', {
          channelId: channel.id,
          code: 'measurement_read_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async pollInputs(): Promise<void> {
    // Slow I/O/MQTT must not create an unbounded interval backlog.
    if (this.polling || !this.connected) return;
    this.polling = true;
    try {
      await this.publishState(false);
    } finally {
      this.polling = false;
    }
  }

  private requestStatePublication(): void {
    if (this.statePublication) {
      this.stateRefreshRequested = true;
      this.forceStateRefresh = true;
      return;
    }
    void this.publishState().catch(() => undefined);
  }

  private publishState(force = true): Promise<void> {
    this.stateRefreshRequested = true;
    this.forceStateRefresh ||= force;
    if (!this.statePublication) {
      this.statePublication = Promise.resolve()
        .then(async () => {
          while (this.stateRefreshRequested) {
            const refreshForced = this.forceStateRefresh;
            this.stateRefreshRequested = false;
            this.forceStateRefresh = false;
            await this.readAndPublishState(refreshForced);
          }
        })
        .finally(() => {
          this.statePublication = undefined;
          if (this.stateRefreshRequested) this.requestStatePublication();
        });
    }
    return this.statePublication;
  }

  private async readAndPublishState(force: boolean): Promise<void> {
    const accepted = this.state.accepted;
    const inputs: Record<string, boolean> = Object.create(null);
    const outputs: Record<string, boolean> = Object.create(null);
    const commandedOutputs: Record<string, boolean> = Object.create(null);
    const errors = accepted ? [...(this.options.device.validate?.(accepted.snapshot) ?? [])] : [];
    const supported = errors.length === 0;
    try {
      await this.options.device.checkAvailability?.();
    } catch (error) {
      errors.push({
        path: 'hardware',
        code: 'hardware_unavailable',
        message: `Check firmware profile, DIN/DOUT mounts and runtime UID permissions: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    if (accepted && supported) {
      for (const channel of accepted.snapshot.logicalChannels) {
        const output = channel.capabilities.includes('output');
        if (!output && !channel.capabilities.includes('input')) continue;
        if (output && typeof this.state.outputs[channel.id] === 'boolean')
          commandedOutputs[channel.id] = this.state.outputs[channel.id];
        const point = accepted.snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
        if (!point) continue;
        try {
          const value = await this.options.device.read(point);
          if (typeof value !== 'boolean') throw new Error('digital state requires a boolean value');
          (output ? outputs : inputs)[channel.id] = value;
        } catch (error) {
          errors.push({
            path: channel.id,
            code: 'digital_read_failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    // A read started on an old configuration must never populate the new revision.
    if (accepted !== this.state.accepted) return;
    const payload = {
      connected: this.connected,
      revision: accepted?.revision ?? null,
      contentHash: accepted?.contentHash ?? null,
      inputs,
      outputs,
      commandedOutputs,
      readiness: {
        configurationAccepted: Boolean(accepted),
        hardwareAvailable: !errors.length,
        ready: Boolean(accepted) && !errors.length && this.connected,
        errors,
      },
    };
    const signature = JSON.stringify(payload);
    if (!force && signature === this.lastPublishedState) return;
    for (const error of errors) {
      if (error.code === 'digital_read_failed')
        void this.publishFault(error.path, { code: error.code, message: error.message }).catch(() => undefined);
    }
    await this.publishOperational('state', payload, { retain: true }, () => accepted === this.state.accepted);
    if (accepted === this.state.accepted) this.lastPublishedState = signature;
  }
  private publishReport(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.options.transport.publish(
      this.topic('configuration/reported'),
      { revision, contentHash, errors },
      { retain: true },
    );
  }
  private reportRejected(revision: number, contentHash: string, errors: ValidationError[]): Promise<void> {
    return this.publishReport(revision, contentHash, errors);
  }
  private publishFault(channelId: string, error: unknown): Promise<void> {
    const fault =
      error && typeof error === 'object' && 'code' in error && 'message' in error
        ? (error as { code: string; message: string })
        : {
            code: 'device_write_failed',
            message: error instanceof Error ? error.message : String(error),
          };
    const key = JSON.stringify([channelId, fault.code]);
    // Repeated failed reads/shutoff retries must not accumulate pending MQTT
    // publications. Retained readiness still carries every current read error.
    if (this.pendingFaults.has(key) || this.pendingFaults.size >= 100) return Promise.resolve();
    this.pendingFaults.add(key);
    return this.publishOperational('faults', { channelId, ...fault }).finally(() => {
      this.pendingFaults.delete(key);
    });
  }
  private acknowledge(
    id: string,
    status: 'accepted' | 'duplicate' | 'rejected',
    error?: string,
    code?: string,
  ): Promise<void> {
    return this.publishOperational('acknowledgements', { id, status, error, code });
  }

  private publishOperational(
    suffix: string,
    payload: Record<string, unknown>,
    options?: { retain?: boolean },
    isCurrent = () => true,
  ): Promise<void> {
    const reservation = this.operationalPublications.then(async () => {
      // Reserve before publishing. Other state saves retain this high-water mark;
      // restart skips unused reservations rather than replaying sequence numbers.
      if (this.sequence === this.reservedSequence) {
        const reserved = this.sequence + 100;
        await this.queueStateUpdate(async () => {
          await this.options.store.save({ ...this.state, sequence: reserved });
          this.state.sequence = reserved;
          this.reservedSequence = reserved;
        });
      }
      return { timestamp: new Date().toISOString(), sequence: ++this.sequence };
    });
    // Serialize sequence allocation, not broker acknowledgements: an in-flight
    // retained-state publish must not hold up a feedback fault or command ack.
    this.operationalPublications = reservation.then(
      () => undefined,
      () => undefined,
    );
    return reservation.then((metadata) =>
      isCurrent()
        ? this.options.transport.publish(
            this.topic(suffix),
            {
              ...payload,
              ...metadata,
            },
            options,
          )
        : undefined,
    );
  }

  private saveState(): Promise<void> {
    return this.queueStateUpdate(() => this.options.store.save(this.state));
  }

  private queueStateUpdate(update: () => Promise<void>): Promise<void> {
    const queued = this.statePersistence.then(update);
    this.statePersistence = queued.catch(() => undefined);
    return queued;
  }
  private topic(suffix: string): string {
    return `${this.options.prefix.replace(/^\/+|\/+$/g, '')}/v1/controllers/${this.options.hardwareId}/${suffix}`;
  }
  private discoveryTopic(): string {
    return `${this.options.prefix.replace(/^\/+|\/+$/g, '')}/discovery/${this.options.hardwareId}`;
  }
  private desiredTopic(): string {
    return this.topic('configuration/desired');
  }
  private commandTopic(): string {
    return this.topic('commands');
  }
  private async releaseFailedWrite(id: string): Promise<{ error: string; code: string }> {
    await this.releaseCommand(id);
    return { error: 'device write failed', code: 'device_write_failed' };
  }
  private async releaseCommand(id: string): Promise<void> {
    this.state.commandIds = this.state.commandIds.filter((commandId) => commandId !== id);
    if (this.state.commandExpiries) delete this.state.commandExpiries[id];
    await this.saveState();
  }
  private pruneCommandExpiries(): void {
    const now = Date.now();
    this.state.commandExpiries = Object.fromEntries(
      Object.entries(this.state.commandExpiries ?? {}).filter(([, expiresAt]) => Date.parse(expiresAt) > now),
    );
    this.state.commandIds = this.state.commandIds.filter((id) => this.state.commandExpiries?.[id]);
  }

  private async runConfigurationUpdate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.configurationUpdates;
    let release!: () => void;
    this.configurationUpdates = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
