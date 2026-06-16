import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent } from './mqtt-message.event';
import { MqttServerConnectionChangedEvent } from './mqtt-connection.event';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';

export enum MqttServerConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  UNKNOWN = 'unknown',
}

export interface MqttServerConnectionState {
  status: MqttServerConnectionStatus;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastError: string | null;
}

@Injectable()
export class MqttClientService implements OnApplicationBootstrap, OnModuleDestroy {
  private clients: Map<number, MqttClient> = new Map();
  private connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  private subscriptions: Map<number, Map<string, 0 | 1 | 2>> = new Map();
  private connectionStates: Map<number, MqttServerConnectionState> = new Map();
  private readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly eventEmitter: EventEmitter2,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly externalCallTimer: ExternalCallTimer,
  ) {}

  async onApplicationBootstrap() {
    // Connect to every configured server so the connection state is tracked
    // (and resources using a dead server get marked unhealthy) even before the first publish/subscribe.
    const servers = await this.mqttServerRepository.find();
    if (servers.length === 0) {
      return;
    }
    this.logger.log(`Establishing monitored connections to ${servers.length} configured MQTT server(s)`);
    for (const server of servers) {
      this.ensureClient(server.id).catch((error) => {
        this.logger.warn(`Failed to initialize MQTT client for server ${server.name}: ${error?.message ?? error}`);
      });
    }
  }

  async onModuleDestroy() {
    // Disconnect all clients on shutdown
    this.logger.log(`Disconnecting from ${this.clients.size} MQTT servers`);
    for (const [id, client] of this.clients.entries()) {
      this.clients.delete(id);
      client.end(true);
    }
  }

  /**
   * Returns the tracked connection state for a single server.
   */
  getConnectionState(serverId: number): MqttServerConnectionState {
    return (
      this.connectionStates.get(serverId) ?? {
        status: MqttServerConnectionStatus.UNKNOWN,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastError: null,
      }
    );
  }

  /**
   * Returns the tracked connection states of all servers that have (or had) a client.
   */
  getAllConnectionStates(): Map<number, MqttServerConnectionState> {
    return new Map(this.connectionStates);
  }

  /**
   * Ensures a (monitored) client exists for the given server. Does not wait for the connection.
   */
  async connectServer(serverId: number): Promise<void> {
    await this.ensureClient(serverId);
  }

  /**
   * Drops the existing client (e.g. after the server config changed) and connects with fresh settings.
   */
  async reconnectServer(serverId: number): Promise<void> {
    this.removeClient(serverId);
    await this.ensureClient(serverId);
  }

  /**
   * Drops the client and all tracked state (e.g. after the server was deleted).
   */
  disconnectServer(serverId: number): void {
    this.removeClient(serverId);
    this.connectionStates.delete(serverId);
    this.subscriptions.delete(serverId);
    this.updateHealthyServerCount();
  }

  private removeClient(serverId: number): void {
    const client = this.clients.get(serverId);
    if (client) {
      // Delete from the map first so the close handler of the old client is ignored
      this.clients.delete(serverId);
      client.end(true);
    }
  }

  private getOrInitState(serverId: number): MqttServerConnectionState {
    let state = this.connectionStates.get(serverId);
    if (!state) {
      state = {
        status: MqttServerConnectionStatus.UNKNOWN,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastError: null,
      };
      this.connectionStates.set(serverId, state);
    }
    return state;
  }

  private setConnectionStatus(serverId: number, status: MqttServerConnectionStatus, error?: string): void {
    const state = this.getOrInitState(serverId);
    const previousStatus = state.status;
    state.status = status;

    if (error !== undefined) {
      state.lastError = error;
    }

    if (status === MqttServerConnectionStatus.CONNECTED) {
      state.lastConnectedAt = new Date();
      state.lastError = null;
    } else if (status === MqttServerConnectionStatus.DISCONNECTED && previousStatus !== status) {
      state.lastDisconnectedAt = new Date();
    }

    this.updateHealthyServerCount();

    if (previousStatus === status) {
      return;
    }

    if (status === MqttServerConnectionStatus.CONNECTED) {
      this.eventEmitter.emit(
        MqttServerConnectionChangedEvent.EVENT_NAME,
        new MqttServerConnectionChangedEvent(serverId, true),
      );
    } else if (status === MqttServerConnectionStatus.DISCONNECTED) {
      this.eventEmitter.emit(
        MqttServerConnectionChangedEvent.EVENT_NAME,
        new MqttServerConnectionChangedEvent(serverId, false, state.lastError ?? undefined),
      );
    }
  }

  /**
   * Returns the (single, persistent) client for the server, creating it if needed.
   * The returned client is not necessarily connected yet; it keeps reconnecting in the background.
   */
  private async ensureClient(serverId: number): Promise<MqttClient> {
    const existing = this.clients.get(serverId);
    if (existing) {
      return existing;
    }

    // If a client is already being created for this server, wait for it
    const pending = this.connectionPromises.get(serverId);
    if (pending) {
      return pending;
    }

    const creation = this.createClient(serverId);
    this.connectionPromises.set(serverId, creation);

    try {
      return await creation;
    } finally {
      this.connectionPromises.delete(serverId);
    }
  }

  /**
   * Waits until the client is connected, rejecting after the timeout.
   */
  private async waitForConnection(serverId: number, client: MqttClient, timeoutMs = 10000): Promise<MqttClient> {
    if (client.connected) {
      return client;
    }

    return new Promise<MqttClient>((resolve, reject) => {
      const onConnect = () => {
        clearTimeout(timeout);
        resolve(client);
      };
      const timeout = setTimeout(() => {
        client.removeListener('connect', onConnect);
        reject(new Error(`Timeout connecting to MQTT server ${serverId}`));
      }, timeoutMs);
      client.once('connect', onConnect);
    });
  }

  private async getOrCreateClient(serverId: number): Promise<MqttClient> {
    const client = await this.ensureClient(serverId);
    return await this.waitForConnection(serverId, client);
  }

  private async createClient(serverId: number): Promise<MqttClient> {
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }
    const password = await this.resolveServerPassword(server);

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

    this.setConnectionStatus(serverId, MqttServerConnectionStatus.CONNECTING);

    const client = mqtt.connect(url, options);
    // Register immediately so there is exactly one client per server at any time
    this.clients.set(serverId, client);

    // Ignore events of clients that have been replaced (e.g. after a config change)
    const isStale = () => this.clients.get(serverId) !== client;

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
      if (isStale()) {
        return;
      }
      this.setConnectionStatus(serverId, MqttServerConnectionStatus.CONNECTED);
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
    });

    client.on('error', (error) => {
      this.logger.error(`MQTT connection error for server ${server.name} (${url}): ${error.message}`);
      if (isStale()) {
        return;
      }
      this.getOrInitState(serverId).lastError = error.message;
      this.updateHealthyServerCount();
    });

    client.on('reconnect', () => {
      this.logger.log(`Reconnecting to MQTT server ${server.name}`);
    });

    client.on('close', () => {
      if (isStale()) {
        return;
      }
      this.setConnectionStatus(serverId, MqttServerConnectionStatus.DISCONNECTED);
    });

    client.on('offline', () => {
      this.logger.log(`MQTT client for server ${server.name} is offline`);
      if (isStale()) {
        return;
      }
      this.setConnectionStatus(serverId, MqttServerConnectionStatus.DISCONNECTED);
    });

    return client;
  }

  private updateHealthyServerCount(): void {
    const healthyCount = Array.from(this.clients.values()).filter((c) => c.connected).length;
    this.metricsService.mqttServersHealthy.set(healthyCount);
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
      return this.externalCallTimer.time(
        'mqtt',
        'publish',
        () =>
          new Promise<void>((resolve, reject) => {
            client.publish(topic, message, { qos, retain }, (error) => {
              if (error) {
                this.logger.error(`Failed to publish to topic ${topic}: ${error.message}`);
                reject(error);
              } else {
                this.logger.debug(`Published to topic ${topic}: ${message}`);
                resolve();
              }
            });
          }),
      );
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
        this.getOrCreateClient(serverId),
        this.mqttServerRepository.findOneBy({ id: serverId }),
      ]);
      const effectiveQos: 0 | 1 | 2 = (qos ?? (server?.defaultSubscribeQos as 0 | 1 | 2) ?? 0) as 0 | 1 | 2;
      await this.externalCallTimer.time(
        'mqtt',
        'subscribe',
        () =>
          new Promise<void>((resolve, reject) => {
            client.subscribe(topic, { qos: effectiveQos }, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
      );
    } catch (error) {
      // Do not throw: the client will keep trying to connect and will subscribe on next connect
      this.logger.warn(
        `Will subscribe to topic ${topic} for server ${serverId} once connection is available: ${error?.message ?? error}`,
      );
    }
  }
}
