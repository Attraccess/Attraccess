import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { MqttServerRecord } from '@attraccess/application-models';
import { MQTT_SERVER_STORE, type MqttServerStore } from '../mqtt-server-store.port';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { safeAuditHost } from '../../audit/policies/administration';
import { AUDIT_RECORDER, AuditActor, AuditDetails, AuditRecorder } from '../../audit/recorder/audit-event';

/** What a connection to the server is opened with (password decrypted). */
function connectionSettings(server: MqttServerRecord): string {
  const { host, port, username, password, useTls, caCert, tlsServername, tlsInsecure } = server;
  return JSON.stringify([host, port, username, password, useTls, caCert, tlsServername, tlsInsecure]);
}

/** Connection metadata only: credentials and certificates are recorded as configured or changed flags. */
function mqttServerAuditDetails(server: MqttServerRecord, passwordChanged: boolean): AuditDetails {
  return {
    serverName: server.name,
    host: safeAuditHost(server.host),
    passwordChanged: passwordChanged ? 1 : 0,
    port: server.port,
    managementPort: server.managementPort ?? 0,
    usernameConfigured: server.username ? 1 : 0,
    useTls: server.useTls ? 1 : 0,
    caCertConfigured: server.caCert ? 1 : 0,
    tlsInsecure: server.tlsInsecure ? 1 : 0,
    tlsServername: safeAuditHost(server.tlsServername ?? ''),
    defaultPublishQos: server.defaultPublishQos,
    defaultPublishRetain: server.defaultPublishRetain ? 1 : 0,
    defaultSubscribeQos: server.defaultSubscribeQos,
  };
}

/** The fields a request actually set: `Object.assign` and the save of the entity ignored undefined ones. */
function definedFields<T extends object>(changes: T): Partial<T> {
  return Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<T>;
}

@Injectable()
export class MqttServerService {
  constructor(
    @Inject(MQTT_SERVER_STORE)
    private readonly servers: MqttServerStore,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /**
   * Get all MQTT servers
   */
  async findAll(): Promise<MqttServerRecord[]> {
    const servers = await this.servers.listServers();
    return servers.map((server) => this.withDecryptedPassword(server));
  }

  /**
   * Get a single MQTT server by ID
   */
  async findOne(id: number): Promise<MqttServerRecord> {
    const server = await this.servers.findServer(id);

    if (!server) {
      throw new NotFoundException(`MQTT server with ID ${id} not found`);
    }

    return this.withDecryptedPassword(server);
  }

  /**
   * Create a new MQTT server
   */
  async create(createMqttServerDto: CreateMqttServerDto, actor: AuditActor): Promise<MqttServerRecord> {
    const saved = await this.servers.createServer({
      ...createMqttServerDto,
      password: createMqttServerDto.password ? this.encryptionService.encrypt(createMqttServerDto.password) : null,
    });
    this.metricsService.mqttServersTotal.inc();
    await this.record(
      actor,
      'mqtt_server.created',
      saved.id,
      mqttServerAuditDetails(saved, createMqttServerDto.password !== undefined),
    );
    return saved;
  }

  /**
   * Update an existing MQTT server
   */
  async update(id: number, updateMqttServerDto: UpdateMqttServerDto, actor: AuditActor): Promise<MqttServerRecord> {
    const server = await this.findOne(id);
    const connectionBefore = connectionSettings(server);

    // The server with the new values; its password is still decrypted here.
    const merged: MqttServerRecord = { ...server, ...definedFields(updateMqttServerDto) };
    const connectionChanged = connectionSettings(merged) !== connectionBefore;

    const saved = await this.servers.updateServer(id, {
      ...definedFields(updateMqttServerDto),
      password: merged.password ? this.encryptionService.encrypt(merged.password) : null,
    });
    if (!saved) throw new NotFoundException(`MQTT server with ID ${id} not found`);
    // A rename or new publish defaults leaves open connections valid.
    if (connectionChanged) this.emitChanged(id);
    await this.record(
      actor,
      'mqtt_server.updated',
      id,
      mqttServerAuditDetails(saved, updateMqttServerDto.password !== undefined),
    );
    return saved;
  }

  /**
   * Delete an MQTT server
   */
  async remove(id: number, actor: AuditActor): Promise<void> {
    const server = await this.findOne(id);
    const details = mqttServerAuditDetails(server, false);
    await this.servers.deleteServer(id);
    this.metricsService.mqttServersTotal.dec();
    this.emitChanged(id);
    await this.record(actor, 'mqtt_server.deleted', id, details);
  }

  private async record(
    actor: AuditActor,
    action: `mqtt_server.${'created' | 'updated' | 'deleted'}`,
    serverId: number,
    details: AuditDetails,
  ): Promise<void> {
    await this.audit.record({
      domain: 'administration',
      action,
      actor,
      subject: { type: 'mqtt-server', id: serverId },
      details,
    });
  }

  /** Connections opened with the old settings (the message explorer's) close. */
  private emitChanged(id: number): void {
    this.eventEmitter.emit(MqttServerChangedEvent.EVENT_NAME, new MqttServerChangedEvent(id));
  }

  /**
   * Returns the server with its password decrypted for use in the app. Assumes stored values are
   * already encrypted (see migration EncryptSensitiveData).
   */
  private withDecryptedPassword(server: MqttServerRecord): MqttServerRecord {
    if (!server.password) return server;
    return { ...server, password: this.encryptionService.decryptIfEncrypted(server.password) ?? server.password };
  }
}
