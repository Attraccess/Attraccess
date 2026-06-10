import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateMqttServerDto, UpdateMqttServerDto, MqttServerConnectionStateDto } from './dtos/mqtt-server.dto';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';
import { MqttClientService } from '../mqtt-client.service';
import { MqttServerDeletedEvent } from '../mqtt-server-deleted.event';

@Injectable()
export class MqttServerService {
  private readonly logger = new Logger(MqttServerService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly mqttClientService: MqttClientService,
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
   * Get the live connection state of all MQTT servers
   */
  async getConnectionStates(): Promise<MqttServerConnectionStateDto[]> {
    const servers = await this.mqttServerRepository.find();
    return servers.map((server) => {
      const state = this.mqttClientService.getConnectionState(server.id);
      return {
        serverId: server.id,
        status: state.status,
        lastConnectedAt: state.lastConnectedAt,
        lastDisconnectedAt: state.lastDisconnectedAt,
        lastError: state.lastError,
      };
    });
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
    this.mqttClientService.connectServer(saved.id).catch((error) => {
      this.logger.warn(`Failed to connect to newly created MQTT server ${saved.id}: ${error?.message ?? error}`);
    });
    return saved;
  }

  /**
   * Update an existing MQTT server
   */
  async update(id: number, updateMqttServerDto: UpdateMqttServerDto): Promise<MqttServer> {
    const server = await this.findOne(id);

    // Update the server with the new values
    Object.assign(server, updateMqttServerDto);
    server.password = server.password ? this.encryptionService.encrypt(server.password) : null;

    const saved = await this.mqttServerRepository.save(server);
    // Reconnect with the new settings
    this.mqttClientService.reconnectServer(id).catch((error) => {
      this.logger.warn(`Failed to reconnect to updated MQTT server ${id}: ${error?.message ?? error}`);
    });
    return saved;
  }

  /**
   * Delete an MQTT server
   */
  async remove(id: number): Promise<void> {
    const server = await this.findOne(id);
    await this.mqttServerRepository.remove(server);
    this.metricsService.mqttServersTotal.dec();
    this.mqttClientService.disconnectServer(id);
    this.eventEmitter.emit(MqttServerDeletedEvent.EVENT_NAME, new MqttServerDeletedEvent(id));
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
