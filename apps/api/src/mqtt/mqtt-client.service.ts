import { MqttServer } from '@attraccess/database-entities';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { MqttClient } from 'mqtt';
import { Repository } from 'typeorm';
import { EncryptionService } from '../encryption/encryption.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { MqttClientSubscriptionsImplementation } from './mqtt-client-subscriptions';
import { TopicSubscription } from './mqtt-client.service.route-context';

@Injectable()
export class MqttClientService extends MqttClientSubscriptionsImplementation implements OnModuleDestroy {
  protected clients: Map<number, MqttClient> = new Map();
  protected connectionPromises: Map<number, Promise<MqttClient>> = new Map();
  protected readonly connectionVersions = new Map<number, number>();
  protected readonly connectionCancellations = new Map<number, Set<() => void>>();
  protected destroyed = false;
  protected subscriptions: Map<number, Map<string, TopicSubscription>> = new Map();
  protected subscriptionOperations: Map<number, Map<string, Promise<void>>> = new Map();
  protected readonly logger = new Logger(MqttClientService.name);

  constructor(
    @InjectRepository(MqttServer)
    protected readonly mqttServerRepository: Repository<MqttServer>,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly encryptionService: EncryptionService,
    protected readonly metricsService: MetricsService,
    protected readonly externalCallTimer: ExternalCallTimer,
  ) {
    super();
  }

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
    this.updateHealthyServerCount();
    this.connectionPromises.delete(serverId);
    await this.getOrCreateClient(serverId, true);
  }

  protected async getOrCreateClient(serverId: number, keepTryingToConnect = false): Promise<MqttClient> {
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
}
