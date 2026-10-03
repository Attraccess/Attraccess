import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttServer } from '@attraccess/database-entities';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttMessageEvent } from './mqtt-message.event';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';

type SubscriptionQos = 0 | 1 | 2;

interface TopicSubscription {
  qosCounts: Map<SubscriptionQos | undefined, number>;
  effectiveQos?: SubscriptionQos;
}

@Injectable()
export class MqttClientService implements OnModuleDestroy {
  private clients: Map<number, MqttClient> = new Map();
  private connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  private readonly connectionVersions = new Map<number, number>();
  private readonly connectionCancellations = new Map<number, Set<() => void>>();
  private destroyed = false;
  private subscriptions: Map<number, Map<string, TopicSubscription>> = new Map();
  private subscriptionOperations: Map<number, Map<string, Promise<void>>> = new Map();
  private readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    private readonly eventEmitter: EventEmitter2,
    private readonly encryptionService: EncryptionService,
    private readonly metricsService: MetricsService,
    private readonly externalCallTimer: ExternalCallTimer,
  ) {}

  async onModuleDestroy() {
    this.destroyed = true;
    const tracked = new Set(this.connectionCancellations.keys());
    this.connectionCancellations.forEach((cancellations) => cancellations.forEach((cancel) => cancel()));
    this.connectionCancellations.clear();
    // Disconnect all clients on shutdown
    this.logger.log(`Disconnecting from ${this.clients.size} MQTT servers`);
    for (const [id, client] of this.clients.entries()) {
      if (!tracked.has(id)) client.end(true);
      this.clients.delete(id);
    }
  }

  /** End connected and reconnecting clients, including failed startup attempts,
   * before loading the current endpoint/credentials. Topic reference counts are
   * retained and replayed on the new connection. Late old-client events are inert.
   */
  async refreshConnection(serverId: number): Promise<void> {
    this.connectionVersions.set(serverId, (this.connectionVersions.get(serverId) ?? 0) + 1);
    if (!this.connectionCancellations.has(serverId)) this.clients.get(serverId)?.end(true);
    this.connectionCancellations.get(serverId)?.forEach((cancel) => cancel());
    this.connectionCancellations.delete(serverId);
    this.clients.delete(serverId);
    this.connectionPromises.delete(serverId);
    await this.getOrCreateClient(serverId, true);
  }

  private async getOrCreateClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
    if (this.destroyed) throw new Error('MQTT connections have stopped');
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
    const version = this.connectionVersions.get(serverId) ?? 0;
    const connectionPromise = this.createClient(serverId, keepTryingToConnect);
    this.connectionPromises.set(serverId, connectionPromise);

    try {
      const client = await connectionPromise;
      if (version !== (this.connectionVersions.get(serverId) ?? 0)) throw new Error('MQTT connection was replaced');
      this.clients.set(serverId, client);
      return client;
    } finally {
      if (this.connectionPromises.get(serverId) === connectionPromise) this.connectionPromises.delete(serverId);
    }
  }

  private async createClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
    const version = this.connectionVersions.get(serverId) ?? 0;
    const server = await this.mqttServerRepository.findOneBy({ id: serverId });

    if (!server) {
      throw new Error(`MQTT server with ID ${serverId} not found`);
    }
    const password = await this.resolveServerPassword(server);
    if (this.destroyed || version !== (this.connectionVersions.get(serverId) ?? 0))
      throw new Error('MQTT connection was replaced');

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

      if (server.useTls) {
        if (server.caCert) {
          options.ca = server.caCert;
        }
        if (server.tlsServername) {
          options.servername = server.tlsServername;
        }
        if (server.tlsInsecure) {
          options.rejectUnauthorized = false;
          this.logger.warn(
            `TLS certificate verification is disabled for MQTT server ${server.name} (${url}) - connection is not protected against man-in-the-middle attacks`,
          );
        }
      }

      const client = mqtt.connect(url, options);
      let active = true;
      const cancellations = this.connectionCancellations.get(serverId) ?? new Set<() => void>();
      this.connectionCancellations.set(serverId, cancellations);
      const cancel = () => {
        if (!active) return;
        active = false;
        clearTimeout(timeout);
        cancellations.delete(cancel);
        client.end(true);
        reject(new Error('MQTT connection was replaced'));
      };
      cancellations.add(cancel);

      client.on('message', (topic, payloadBuffer) => {
        if (!active) return;
        const payloadString = payloadBuffer.toString();
        let payload = payloadString;
        try {
          payload = JSON.parse(payloadString);
        } catch {
          // propably not json, just ignore it
        }
        this.logger.debug(`mqtt message: ${topic}: ${payloadString}`);

        this.eventEmitter.emit(
          MqttMessageEvent.EVENT_NAME,
          new MqttMessageEvent(serverId, topic, payload, payloadBuffer),
        );
      });

      client.on('connect', () => {
        if (!active) return;
        this.logger.log(`Connected to MQTT server ${server.name} (${url})`);
        this.clients.set(serverId, client);
        this.updateHealthyServerCount();
        // Re-subscribe to all known topics for this server on each successful connect
        const topics = this.subscriptions.get(serverId);
        if (topics && topics.size > 0) {
          for (const [t, subscription] of topics.entries()) {
            // A broker connection has no active subscriptions until this request succeeds.
            subscription.effectiveQos = undefined;
            const effectiveQos = this.effectiveQos(subscription, server.defaultSubscribeQos as SubscriptionQos);
            client.subscribe(t, { qos: effectiveQos }, (err) => {
              if (!active) return;
              if (err) {
                this.logger.warn(`Failed to (re)subscribe to ${t} on server ${server.name}: ${err.message}`);
                return;
              }
              if (this.subscriptions.get(serverId)?.get(t) !== subscription) {
                return;
              }
              if (this.effectiveQos(subscription, server.defaultSubscribeQos as SubscriptionQos) === effectiveQos) {
                subscription.effectiveQos = effectiveQos;
              } else {
                void this.reconcileSubscription(serverId, t, true).catch((error) => {
                  this.logger.warn(`Failed to reconcile MQTT subscription ${t} on server ${server.name}: ${error.message}`);
                });
              }
            });
            this.logger.debug(`(re)subscribed to ${t} on server ${server.name} with qos=${effectiveQos}`);
          }
        }
        resolve(client);
      });

      client.on('error', (error) => {
        if (!active) return;
        this.logger.error(`MQTT connection error for server ${server.name} (${url}): ${error.message}`);
        this.updateHealthyServerCount();
      });

      client.on('reconnect', () => {
        if (!active) return;
        this.logger.log(`Reconnecting to MQTT server ${server.name}`);
      });

      client.on('disconnect', () => {
        if (!active) return;
        this.logger.log(`Disconnected from MQTT server ${server.name}`);
      });

      client.on('offline', () => {
        if (!active) return;
        this.logger.log(`MQTT client for server ${server.name} is offline`);
        this.updateHealthyServerCount();
      });

      // Reject after 10 seconds if connection hasn't been established
      const timeout = setTimeout(() => {
        if (!client.connected) {
          const errorMsg = `Timeout connecting to MQTT server ${server.name}`;
          reject(new Error(errorMsg));
          if (!keepTryingToConnect) {
            cancel();
          }
        }
      }, 10000);

      // Clear timeout when connected
      client.once('connect', () => {
        clearTimeout(timeout);
      });
    });
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
    message: string | Buffer,
    options?: { qos?: 0 | 1 | 2; retain?: boolean },
    completion?: { awaitAcknowledgement?: boolean; acknowledgementTimeoutSeconds?: number },
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
      const startPublish = () =>
        new Promise<void>((resolve, reject) => {
          client.publish(topic, message, { qos, retain }, (error) => {
            if (error) {
              this.logger.error(`Failed to publish to topic ${topic}: ${error.message}`);
              reject(error);
            } else {
              this.logger.debug(`Published to topic ${topic}: ${message.toString()}`);
              resolve();
            }
          });
        });

      if (completion?.awaitAcknowledgement === false) {
        // The flow continues after dispatch, while the background operation still records metrics.
        void this.externalCallTimer.time('mqtt', 'publish', startPublish).catch(() => undefined);
        return;
      }

      const completionTimeout = completion?.acknowledgementTimeoutSeconds;
      return this.externalCallTimer.time('mqtt', 'publish', () => {
        const publish = startPublish();
        if (!completionTimeout) {
          return publish;
        }

        let acknowledgementTimeout: ReturnType<typeof setTimeout> | undefined;
        return Promise.race([
          publish,
          new Promise<never>((_resolve, reject) => {
            acknowledgementTimeout = setTimeout(() => {
              const error = new Error(`MQTT publish acknowledgement timed out after ${completionTimeout} seconds`);
              error.name = 'MqttAcknowledgementTimeoutError';
              reject(error);
            }, completionTimeout * 1000);
          }),
        ]).finally(() => {
          if (acknowledgementTimeout) {
            clearTimeout(acknowledgementTimeout);
          }
        });
      });
    } catch (error) {
      this.logger.error(`Failed to publish to MQTT server ${serverId}`, error);
      throw error;
    }
  }

  async subscribe(serverId: number, topic: string, qos?: 0 | 1 | 2, requireAcknowledgement = false): Promise<void> {
    // Track desired subscriptions so they can be (re)applied on connect/reconnect
    if (!this.subscriptions.has(serverId)) {
      this.subscriptions.set(serverId, new Map());
    }
    const serverTopics = this.subscriptions.get(serverId);
    const existingSubscription = serverTopics.get(topic);
    if (existingSubscription) {
      existingSubscription.qosCounts.set(qos, (existingSubscription.qosCounts.get(qos) ?? 0) + 1);
    } else {
      serverTopics.set(topic, { qosCounts: new Map([[qos, 1]]) });
    }

    try {
      await this.reconcileSubscription(serverId, topic, true);
    } catch (error) {
      if (requireAcknowledgement) {
        throw error;
      }
      // The client will keep trying to connect and will subscribe on next connect.
      this.logger.warn(
        `Will subscribe to topic ${topic} for server ${serverId} once connection is available: ${error?.message ?? error}`,
      );
    }
  }

  async unsubscribe(serverId: number, topic: string, qos?: SubscriptionQos): Promise<void> {
    const topics = this.subscriptions.get(serverId);
    const subscription = topics?.get(topic);
    if (!subscription) {
      return;
    }
    const qosCount = subscription.qosCounts.get(qos);
    if (!qosCount) {
      return;
    }
    const client = this.clients.get(serverId);
    if (qosCount === 1) {
      subscription.qosCounts.delete(qos);
    } else {
      subscription.qosCounts.set(qos, qosCount - 1);
    }

    if (subscription.qosCounts.size === 0) {
      topics.delete(topic);
      if (topics.size === 0) {
        this.subscriptions.delete(serverId);
      }
    }

    // A pending subscribe operation will see the updated desired state.
    if (!client?.connected) {
      return;
    }

    await this.reconcileSubscription(serverId, topic, false);
  }

  /** Serializes broker changes so the last desired QoS always wins. */
  private reconcileSubscription(serverId: number, topic: string, connect: boolean): Promise<void> {
    const operations = this.subscriptionOperations.get(serverId) ?? new Map<string, Promise<void>>();
    this.subscriptionOperations.set(serverId, operations);
    const previous = operations.get(topic) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      const version = this.connectionVersions.get(serverId) ?? 0;
      const subscription = this.subscriptions.get(serverId)?.get(topic);
      const client = connect ? await this.getOrCreateClient(serverId, true) : this.clients.get(serverId);

      if (!subscription) {
        if (!client?.connected) {
          return;
        }
        await new Promise<void>((resolve, reject) => {
          client.unsubscribe(topic, (error) => (error ? reject(error) : resolve()));
        });
        return;
      }

      const server = await this.mqttServerRepository.findOneBy({ id: serverId });
      // State may have changed while resolving the server or opening a connection.
      if (this.subscriptions.get(serverId)?.get(topic) !== subscription) {
        return;
      }
      const effectiveQos = this.effectiveQos(subscription, server?.defaultSubscribeQos as SubscriptionQos);
      if (subscription.effectiveQos === effectiveQos || !client?.connected) {
        return;
      }
      await this.externalCallTimer.time(
        'mqtt',
        'subscribe',
        () =>
          new Promise<void>((resolve, reject) => {
            client.subscribe(topic, { qos: effectiveQos }, (error) => (error ? reject(error) : resolve()));
          }),
      );
      if (version === (this.connectionVersions.get(serverId) ?? 0)) subscription.effectiveQos = effectiveQos;
    });
    operations.set(topic, operation);
    void operation.finally(() => {
      if (operations.get(topic) !== operation) {
        return;
      }
      operations.delete(topic);
      if (operations.size === 0) {
        this.subscriptionOperations.delete(serverId);
      }
    }).catch(() => undefined);
    return operation;
  }

  private effectiveQos(subscription: TopicSubscription, defaultQos?: SubscriptionQos): SubscriptionQos {
    return Math.max(
      ...Array.from(subscription.qosCounts.entries(), ([qos, count]) => (count > 0 ? (qos ?? defaultQos ?? 0) : 0)),
    ) as SubscriptionQos;
  }
}
