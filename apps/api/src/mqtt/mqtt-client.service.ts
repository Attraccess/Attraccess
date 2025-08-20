import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { MqttMonitoringService } from './mqtt-monitoring.service';
import { TestConnectionResponseDto, MqttServerStatusDto } from './servers/dtos/mqtt-server.dto';

@Injectable()
export class MqttClientService implements OnModuleInit, OnModuleDestroy {
  private clients: Map<number, MqttClient> = new Map();
  private connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  private readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly monitoringService: MqttMonitoringService
  ) {}

  async onModuleInit() {
    // Lazy initialization - don't connect to any servers at startup
    this.logger.log('MQTT Client Service initialized');
  }

  async onModuleDestroy() {
    // Disconnect all clients on shutdown
    this.logger.log(`Disconnecting from ${this.clients.size} MQTT servers`);
    for (const [id, client] of this.clients.entries()) {
      client.end(true);
      this.clients.delete(id);
      this.monitoringService.onDisconnect(id);
    }
  }

  private async getOrCreateClient(serverId: number): Promise<MqttClient> {
    // If there's an existing connection being established, wait for it
    if (this.connectionPromises.has(serverId)) {
      const connectionPromise = this.connectionPromises.get(serverId);
      if (connectionPromise) {
        return connectionPromise;
      }
    }

    // If we already have a connected client, return it
    if (this.clients.has(serverId)) {
      const client = this.clients.get(serverId);
      if (client && client.connected) {
        return client;
      }
    }

    // Otherwise, create a new connection promise
    const connectionPromise = this.createClient(serverId);
    this.connectionPromises.set(serverId, connectionPromise);

    try {
      const client = await connectionPromise;
      this.clients.set(serverId, client);
      return client;
    } finally {
      this.connectionPromises.delete(serverId);
    }
  }

  private async createClient(serverId: number): Promise<MqttClient> {
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }

    // Register server with monitoring service
    this.monitoringService.registerServer(serverId);
    // Record connection attempt
    this.monitoringService.onConnectAttempt(serverId);

    return new Promise((resolve, reject) => {
      const url = `${server.useTls ? 'mqtts' : 'mqtt'}://${server.host}:${server.port}`;

      const options: mqtt.IClientOptions = {
        clientId: server.clientId || `attraccess-api-${Math.random().toString(16).slice(2, 10)}`,
        clean: true,
        reconnectPeriod: 5000,
      };

      if (server.username) {
        options.username = server.username;
      }

      if (server.password) {
        options.password = server.password;
      }

      const client = mqtt.connect(url, options);

      client.on('connect', () => {
        this.logger.log(`Connected to MQTT server ${server.name} (${url})`);
        this.monitoringService.onConnectSuccess(serverId);
        resolve(client);
      });

      client.on('error', (error) => {
        this.logger.error(`MQTT connection error for server ${server.name}: ${error.message}`);
        this.logger.error(error);
        this.monitoringService.onConnectFailure(serverId, error.message);
        // Don't reject as the client will try to reconnect
      });

      client.on('reconnect', () => {
        this.logger.log(`Reconnecting to MQTT server ${server.name}`);
        this.monitoringService.onConnectAttempt(serverId);
      });

      client.on('disconnect', () => {
        this.logger.log(`Disconnected from MQTT server ${server.name}`);
        this.monitoringService.onDisconnect(serverId);
      });

      client.on('offline', () => {
        this.logger.log(`MQTT client for server ${server.name} is offline`);
        this.monitoringService.onDisconnect(serverId);
      });

      // Reject after 10 seconds if connection hasn't been established
      const timeout = setTimeout(() => {
        if (!client.connected) {
          const errorMsg = `Timeout connecting to MQTT server ${server.name}`;
          this.monitoringService.onConnectFailure(serverId, errorMsg);
          reject(new Error(errorMsg));
          client.end(true);
        }
      }, 10000);

      // Clear timeout when connected
      client.once('connect', () => {
        clearTimeout(timeout);
      });
    });
  }

  async publish(serverId: number, topic: string, message: string): Promise<void> {
    try {
      const client = await this.getOrCreateClient(serverId);
      return new Promise((resolve, reject) => {
        client.publish(topic, message, { qos: 2, retain: true }, (error) => {
          if (error) {
            this.logger.error(`Failed to publish to topic ${topic}: ${error.message}`);
            this.monitoringService.onPublishFailure(serverId, error.message);
            reject(error);
          } else {
            this.logger.debug(`Published to topic ${topic}: ${message}`);
            this.monitoringService.onPublishSuccess(serverId);
            resolve();
          }
        });
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to publish to MQTT server ${serverId}`, error);
      this.monitoringService.onPublishFailure(serverId, errorMsg);
      throw error;
    }
  }

  async testConnection(serverId: number): Promise<TestConnectionResponseDto> {
    try {
      await this.getOrCreateClient(serverId);
      const healthStatus = this.monitoringService.getConnectionHealthStatus(serverId);
      return {
        success: true,
        message: `Connection successful. ${healthStatus.details}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async getStatusOfOne(serverId: number): Promise<MqttServerStatusDto> {
    const client = this.clients.get(serverId);
    const connected = client?.connected || false;
    const healthStatus = this.monitoringService.getConnectionHealthStatus(serverId);

    return {
      connected,
      healthStatus,
      stats: {
        connection: this.monitoringService.getConnectionStats(serverId),
        messages: this.monitoringService.getMessageStats(serverId),
      },
    };
  }

  async getStatusOfAll(): Promise<Record<string, MqttServerStatusDto>> {
    const result: Record<string, MqttServerStatusDto> = {};
    const allStats = this.monitoringService.getAllServerStats();

    for (const [serverId, stats] of Object.entries(allStats)) {
      const id = Number(serverId);
      const client = this.clients.get(id);
      const connected = client?.connected || false;
      const healthStatus = this.monitoringService.getConnectionHealthStatus(id);

      result[serverId] = {
        connected,
        healthStatus,
        stats,
      };
    }

    return result;
  }
}
