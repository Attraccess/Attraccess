import { hash, validateDesired } from './configuration';
import { OutputController } from './output-controller';
import {
  type DeviceAdapter,
  type DiscoveryClaim,
  type RuntimeState,
  type Snapshot,
  type StateStore,
  type Transport,
  type ValidationError,
} from './runtime-types';

export { PROTOCOL_VERSION, hash, validateDesired, validateSnapshot } from './configuration';
export { JsonStateStore } from './state-store';
export type { DeviceAdapter, RuntimeState, Snapshot, Transport, ValidationError } from './runtime-types';

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
      saveState: () => this.options.store.save(this.state),
      publishState: () => this.publishState(),
      publishFault: (channelId, error) => this.publishFault(channelId, error),
    });
  }

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
    if (!command?.id || !command.channelId || !['set', 'pulse'].includes(command.action)) return;
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
      const channel = this.state.accepted?.snapshot.logicalChannels.find((item) => item.id === command.channelId);
      if (!channel || !channel.capabilities.includes('output'))
        return this.acknowledge(command.id, 'rejected', 'unknown output channel', 'unknown_channel');
      if (!(await this.outputs.isGuardSatisfied(channel)))
        return this.acknowledge(command.id, 'rejected', 'operational guard is not satisfied', 'guard_rejected');
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
      await this.options.store.save(this.state);
      if (command.action === 'pulse') {
        if (!(await this.outputs.write(channel, true, () => this.outputs.schedulePulse(channel, duration))))
          return this.rejectFailedWrite(command.id);
      } else if (!(await this.outputs.write(channel, command.value))) return this.rejectFailedWrite(command.id);
      await this.acknowledge(command.id, 'accepted');
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
    for (const channel of accepted.snapshot.logicalChannels.filter((item) =>
      item.capabilities.includes('measurement'),
    )) {
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

  private async publishState(): Promise<void> {
    await this.options.transport.publish(
      this.topic('state'),
      {
        connected: this.connected,
        revision: this.state.accepted?.revision ?? null,
        contentHash: this.state.accepted?.contentHash ?? null,
        outputs: this.state.outputs,
      },
      { retain: true },
    );
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
    return this.options.transport.publish(this.topic('faults'), {
      channelId,
      code: 'device_write_failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  private acknowledge(
    id: string,
    status: 'accepted' | 'duplicate' | 'rejected',
    error?: string,
    code?: string,
  ): Promise<void> {
    return this.options.transport.publish(this.topic('acknowledgements'), { id, status, error, code });
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
  private async rejectFailedWrite(id: string): Promise<void> {
    this.state.commandIds = this.state.commandIds.filter((commandId) => commandId !== id);
    if (this.state.commandExpiries) delete this.state.commandExpiries[id];
    await this.options.store.save(this.state);
    await this.acknowledge(id, 'rejected', 'device write failed', 'device_write_failed');
  }
  private pruneCommandExpiries(): void {
    const now = Date.now();
    this.state.commandExpiries = Object.fromEntries(
      Object.entries(this.state.commandExpiries ?? {}).filter(([, expiresAt]) => Date.parse(expiresAt) > now),
    );
  }
}
