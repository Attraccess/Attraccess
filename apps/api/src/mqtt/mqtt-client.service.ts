import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { MqttConnectionError } from './errors/mqtt-connection.error';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent } from './mqtt-message.event';

@Injectable()
export class MqttClientService implements OnModuleDestroy {
  private clients: Map<number, MqttClient> = new Map();
  private connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  private readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleDestroy() {
    // Disconnect all clients on shutdown
    this.logger.log(`Disconnecting from ${this.clients.size} MQTT servers`);
    for (const [id, client] of this.clients.entries()) {
      client.end(true);
      this.clients.delete(id);
    }
  }

  private async getOrCreateClient(serverId: number, keepTryingToConenct = false): Promise<MqttClient> {
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
    const connectionPromise = this.createClient(serverId, keepTryingToConenct);
    this.connectionPromises.set(serverId, connectionPromise);

    try {
      const client = await connectionPromise;
      this.clients.set(serverId, client);
      return client;
    } finally {
      this.connectionPromises.delete(serverId);
    }
  }

  private async createClient(serverId: number, keepTryingToConenct = false): Promise<MqttClient> {
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }

    return new Promise((resolve, reject) => {
      const url = `${server.useTls ? 'mqtts' : 'mqtt'}://${server.host}:${server.port}`;

      const options: mqtt.IClientOptions = {
        clientId: server.clientId || `attraccess-client`,
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

      client.on('message', (topic, payloadBuffer) => {
        const payloadString = payloadBuffer.toString();
        let payload = payloadString;
        try {
          payload = JSON.parse(payloadString);
        } catch {
          // propably not json, just ignore it
        }
        this.logger.debug('mqtt message', topic, payload);

        this.eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(serverId, topic, payload));
      });

      client.on('connect', () => {
        this.logger.log(`Connected to MQTT server ${server.name} (${url})`);
        resolve(client);
      });

      client.on('error', (error) => {
        this.logger.error(`MQTT connection error for server ${server.name}: ${error.message}`);
        this.logger.error(error);
      });

      client.on('reconnect', () => {
        this.logger.log(`Reconnecting to MQTT server ${server.name}`);
      });

      client.on('disconnect', () => {
        this.logger.log(`Disconnected from MQTT server ${server.name}`);
      });

      client.on('offline', () => {
        this.logger.log(`MQTT client for server ${server.name} is offline`);
      });

      // Reject after 10 seconds if connection hasn't been established
      const timeout = setTimeout(() => {
        if (!client.connected) {
          const errorMsg = `Timeout connecting to MQTT server ${server.name}`;
          reject(new Error(errorMsg));
          if (!keepTryingToConenct) {
            client.end(true);
          }
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
            reject(error);
          } else {
            this.logger.debug(`Published to topic ${topic}: ${message}`);
            resolve();
          }
        });
      });
    } catch (error) {
      this.logger.error(`Failed to publish to MQTT server ${serverId}`, error);
      throw error;
    }
  }

  async subscribe(serverId: number, topic: string): Promise<void> {
    try {
      const client = await this.getOrCreateClient(serverId, true);
      client.subscribe(topic);
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic ${topic} for server ${serverId}`, error);
      throw new MqttConnectionError(error.message);
    }
  }
}
