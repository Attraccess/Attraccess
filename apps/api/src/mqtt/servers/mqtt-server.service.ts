import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { CreateMqttServerDto, UpdateMqttServerDto } from './dtos/mqtt-server.dto';

@Injectable()
export class MqttServerService {
  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>
  ) {}

  /**
   * Get all MQTT servers
   */
  async findAll(): Promise<MqttServer[]> {
    return this.mqttServerRepository.find();
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

    return server;
  }

  /**
   * Create a new MQTT server
   */
  async create(createMqttServerDto: CreateMqttServerDto): Promise<MqttServer> {
    const newServer = this.mqttServerRepository.create(createMqttServerDto);
    return this.mqttServerRepository.save(newServer);
  }

  /**
   * Update an existing MQTT server
   */
  async update(id: number, updateMqttServerDto: UpdateMqttServerDto): Promise<MqttServer> {
    const server = await this.findOne(id);

    // Update the server with the new values
    Object.assign(server, updateMqttServerDto);

    return this.mqttServerRepository.save(server);
  }

  /**
   * Delete an MQTT server
   */
  async remove(id: number): Promise<void> {
    const server = await this.findOne(id);
    await this.mqttServerRepository.remove(server);
  }
}
