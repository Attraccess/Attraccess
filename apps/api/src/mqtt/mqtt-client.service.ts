import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent } from './mqtt-message.event';
import { EncryptionService } from '../encryption/encryption.service';

@Injectable()
export class MqttClientService implements OnModuleDestroy {
  private clients: Map<number, MqttClient> = new Map();
  private connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  private subscriptions: Map<number, Map<string, 0 | 1 | 2>> = new Map();
  private readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly eventEmitter: EventEmitter2,
    private readonly encryptionService: EncryptionService,
  ) {}

  async onModuleDestroy() {
    // Disconnect all clients on shutdown
    this.logger.log(`Disconnecting from ${this.clients.size} MQTT servers`);
    for (const [id, client] of this.clients.entries()) {
      client.end(true);
      this.clients.delete(id);
    }
  }

  private async getOrCreateClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
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
    const connectionPromise = this.createClient(serverId, keepTryingToConnect);
    this.connectionPromises.set(serverId, connectionPromise);

    try {
      const client = await connectionPromise;
      this.clients.set(serverId, client);
      return client;
    } finally {
      this.connectionPromises.delete(serverId);
    }
  }

  private async createClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }
    const password = await this.resolveServerPassword(server);

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

      if (password) {
        options.password = password;
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
        this.logger.debug(`mqtt message: ${topic}: ${payloadString}`);

        this.eventEmitter.emit(MqttMessageEvent.EVENT_NAME, new MqttMessageEvent(serverId, topic, payload));
      });

      client.on('connect', () => {
        this.logger.log(`Connected to MQTT server ${server.name} (${url})`);
        // Re-subscribe to all known topics for this server on each successful connect
        const topics = this.subscriptions.get(serverId);
        if (topics && topics.size > 0) {
          for (const [t, qos] of topics.entries()) {
            client.subscribe(t, { qos: qos ?? (server.defaultSubscribeQos as 0 | 1 | 2) ?? 0 }, (err) => {
              if (err) {
                this.logger.warn(`Failed to (re)subscribe to ${t} on server ${server.name}: ${err.message}`);
              }
            });
            this.logger.debug(`(re)subscribed to ${t} on server ${server.name} with qos=${qos ?? 0}`);
          }
        }
        resolve(client);
      });

      client.on('error', (error) => {
        this.logger.error(`MQTT connection error for server ${server.name} (${url}): ${error.message}`);
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
          if (!keepTryingToConnect) {
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

  private async resolveServerPassword(server: MqttServer): Promise<string | null> {
    if (!server.password) {
      return null;
    }

    if (this.encryptionService.isEncrypted(server.password)) {
      return this.encryptionService.decrypt(server.password);
    }

    const plaintext = server.password;
    const encrypted = this.encryptionService.encrypt(plaintext);
    await this.mqttServerRepository.update(server.id, { password: encrypted });
    return plaintext;
  }

  async publish(
    serverId: number,
    topic: string,
    message: string,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): Promise<void> {
    try {
      const [client, server] = await Promise.all([
        this.getOrCreateClient(serverId),
        this.mqttServerRepository.findOneBy({ id: serverId }),
      ]);

      if (!server) {
        throw new Error(`MQTT server with ID ${serverId} not found`);
      }

      const qos: 0 | 1 | 2 = (options?.qos ?? (server.defaultPublishQos as 0 | 1 | 2) ?? 0) as 0 | 1 | 2;
      const retain: boolean = options?.retain ?? Boolean(server.defaultPublishRetain ?? false);
      return new Promise((resolve, reject) => {
        client.publish(topic, message, { qos, retain }, (error) => {
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

  async subscribe(serverId: number, topic: string, qos?: 0 | 1 | 2): Promise<void> {
    // Track desired subscriptions so they can be (re)applied on connect/reconnect
    if (!this.subscriptions.has(serverId)) {
      this.subscriptions.set(serverId, new Map());
    }
    const serverTopics = this.subscriptions.get(serverId);
    if (qos !== undefined) {
      serverTopics.set(topic, qos);
    } else if (!serverTopics.has(topic)) {
      // Leave qos undefined to allow resolution from server defaults on (re)subscribe
      serverTopics.set(topic, undefined as unknown as 0 | 1 | 2);
    }

    try {
      const [client, server] = await Promise.all([
        this.getOrCreateClient(serverId, true),
        this.mqttServerRepository.findOneBy({ id: serverId }),
      ]);
      const effectiveQos: 0 | 1 | 2 = (qos ?? (server?.defaultSubscribeQos as 0 | 1 | 2) ?? 0) as 0 | 1 | 2;
      client.subscribe(topic, { qos: effectiveQos });
    } catch (error) {
      // Do not throw: the client will keep trying to connect and will subscribe on next connect
      this.logger.warn(
        `Will subscribe to topic ${topic} for server ${serverId} once connection is available: ${error?.message ?? error}`,
      );
    }
  }
}
