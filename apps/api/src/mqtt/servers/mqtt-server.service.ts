import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';

/** What a connection to the server is opened with (password decrypted). */
function connectionSettings(server: MqttServer): string {
  const { host, port, username, password, useTls, caCert, tlsServername, tlsInsecure } = server;
  return JSON.stringify([host, port, username, password, useTls, caCert, tlsServername, tlsInsecure]);
}

@Injectable()
export class MqttServerService {
  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly eventEmitter: EventEmitter2,
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
  async create(createMqttServerDto: CreateMqttServerDto): Promise<MqttServer> {
    const newServer = this.mqttServerRepository.create({
      ...createMqttServerDto,
      password: createMqttServerDto.password ? this.encryptionService.encrypt(createMqttServerDto.password) : null,
    });
    const saved = await this.mqttServerRepository.save(newServer);
    this.metricsService.mqttServersTotal.inc();
    return saved;
  }

  /**
   * Update an existing MQTT server
   */
  async update(id: number, updateMqttServerDto: UpdateMqttServerDto): Promise<MqttServer> {
    const server = await this.findOne(id);
    const connectionBefore = connectionSettings(server);

    // Update the server with the new values
    Object.assign(server, updateMqttServerDto);
    const connectionChanged = connectionSettings(server) !== connectionBefore;
    server.password = server.password ? this.encryptionService.encrypt(server.password) : null;

    const saved = await this.mqttServerRepository.save(server);
    // A rename or new publish defaults leaves open connections valid.
    if (connectionChanged) this.emitChanged(id);
    return saved;
  }

  /**
   * Delete an MQTT server
   */
  async remove(id: number): Promise<void> {
    const server = await this.findOne(id);
    await this.mqttServerRepository.remove(server);
    this.metricsService.mqttServersTotal.dec();
    this.emitChanged(id);
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
