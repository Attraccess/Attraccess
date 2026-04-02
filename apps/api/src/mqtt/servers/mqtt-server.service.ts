import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';
import { EncryptionService } from '../../encryption/encryption.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class MqttServerService {
  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
  ) { }

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

    // Update the server with the new values
    Object.assign(server, updateMqttServerDto);
    server.password = server.password ? this.encryptionService.encrypt(server.password) : null;

    return this.mqttServerRepository.save(server);
  }

  /**
   * Delete an MQTT server
   */
  async remove(id: number): Promise<void> {
    const server = await this.findOne(id);
    await this.mqttServerRepository.remove(server);
    this.metricsService.mqttServersTotal.dec();
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
