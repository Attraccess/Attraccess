import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { safeAuditHost } from '../../audit/policies/administration';
import { AUDIT_RECORDER, AuditActor, AuditDetails, AuditRecorder } from '../../audit/recorder/audit-event';

/** What a connection to the server is opened with (password decrypted). */
function connectionSettings(server: MqttServer): string {
  const { host, port, username, password, useTls, caCert, tlsServername, tlsInsecure } = server;
  return JSON.stringify([host, port, username, password, useTls, caCert, tlsServername, tlsInsecure]);
}

/** Connection metadata only: credentials and certificates are recorded as configured or changed flags. */
function mqttServerAuditDetails(server: MqttServer, passwordChanged: boolean): AuditDetails {
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

@Injectable()
export class MqttServerService {
  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /**
   * Get all MQTT servers
   */
  async findAll(): Promise<MqttServer[]> {
    const servers = await this.mqttServerRepository.find();
    servers.forEach((server) => this.decryptServerPassword(server));
    return servers;
  }

  /**
   * Get a single MQTT server by ID
   */
  async findOne(id: number): Promise<MqttServer> {
    const server = await this.mqttServerRepository.findOne({
      where: { id },
    });

    if (!server) {
      throw new NotFoundException(`MQTT server with ID ${id} not found`);
    }

    this.decryptServerPassword(server);
    return server;
  }

  /**
   * Create a new MQTT server
   */
  async create(createMqttServerDto: CreateMqttServerDto, actor: AuditActor): Promise<MqttServer> {
    const newServer = this.mqttServerRepository.create({
      ...createMqttServerDto,
      password: createMqttServerDto.password ? this.encryptionService.encrypt(createMqttServerDto.password) : null,
    });
    const saved = await this.mqttServerRepository.save(newServer);
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
  async update(id: number, updateMqttServerDto: UpdateMqttServerDto, actor: AuditActor): Promise<MqttServer> {
    const server = await this.findOne(id);
    const connectionBefore = connectionSettings(server);

    // Update the server with the new values
    Object.assign(server, updateMqttServerDto);
    const connectionChanged = connectionSettings(server) !== connectionBefore;
    server.password = server.password ? this.encryptionService.encrypt(server.password) : null;

    const saved = await this.mqttServerRepository.save(server);
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
    // Taken before the removal, which clears the entity's id.
    const details = mqttServerAuditDetails(server, false);
    await this.mqttServerRepository.remove(server);
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
   * Decrypts password in place for use in the app. Assumes stored values are
   * already encrypted (see migration EncryptSensitiveData).
   */
  private decryptServerPassword(server: MqttServer): void {
    if (server.password) {
      server.password = this.encryptionService.decryptIfEncrypted(server.password) ?? server.password;
    }
  }
}
