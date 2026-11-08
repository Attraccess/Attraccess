import { MqttServer } from '@attraccess/database-entities';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { Repository } from 'typeorm';
import { buildMqttConnectionSettings } from '../mqtt-connection-options';
import { MqttClientService } from '../mqtt-client.service';
import { CONNECT_TIMEOUT_MS, CONNECTION_GRACE_MS, topicMatchesFilter } from './mqtt-explorer.constants';

export type ExplorerMessageHandler = (topic: string, payload: Buffer) => void;

export interface ExplorerSubscription {
  unsubscribe(): void;
}

interface ExplorerConnection {
  readonly serverId: number;
  readonly handlers: Map<string, Set<ExplorerMessageHandler>>;
  client?: MqttClient;
  ready: Promise<MqttClient>;
  viewers: number;
  closeTimer?: ReturnType<typeof setTimeout>;
}

/**
 * The explorer's own broker connection per MQTT server. Explorer messages must not
 * share the flow connection: every message on that one fires the flow trigger
 * dispatcher (a query per message), so a `#` filter would load the API. This
 * connection opens with the first viewer and closes shortly after the last one.
 */
@Injectable()
export class MqttExplorerConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(MqttExplorerConnectionsService.name);
  private readonly connections = new Map<number, ExplorerConnection>();

  constructor(
    @InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>,
    private readonly mqttClient: MqttClientService,
  ) {}

  onModuleDestroy(): void {
    for (const connection of this.connections.values()) this.close(connection);
  }

  get openConnectionCount(): number {
    return this.connections.size;
  }

  async subscribe(serverId: number, filter: string, onMessage: ExplorerMessageHandler): Promise<ExplorerSubscription> {
    const connection = this.acquire(serverId);
    let released = false;
    const unsubscribe = () => {
      if (released) return;
      released = true;
      this.removeHandler(connection, filter, onMessage);
      this.release(connection);
    };

    // Handlers first: retained messages can arrive right behind the SUBACK.
    const handlers = connection.handlers.get(filter) ?? new Set();
    const firstForFilter = handlers.size === 0;
    handlers.add(onMessage);
    connection.handlers.set(filter, handlers);
    try {
      const client = await connection.ready;
      if (firstForFilter) await this.brokerSubscribe(client, filter);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return { unsubscribe };
  }

  private acquire(serverId: number): ExplorerConnection {
    let connection = this.connections.get(serverId);
    if (connection) {
      clearTimeout(connection.closeTimer);
      connection.closeTimer = undefined;
      connection.viewers += 1;
      return connection;
    }
    const created: ExplorerConnection = {
      serverId,
      handlers: new Map(),
      viewers: 1,
      ready: undefined as unknown as Promise<MqttClient>,
    };
    created.ready = this.connect(created);
    // A failed connect is reported to whoever awaits `ready`; do not leave it unhandled.
    created.ready.catch(() => this.close(created));
    connection = created;
    this.connections.set(serverId, connection);
    return connection;
  }

  private release(connection: ExplorerConnection): void {
    connection.viewers -= 1;
    if (connection.viewers > 0 || this.connections.get(connection.serverId) !== connection) return;
    connection.closeTimer = setTimeout(() => this.close(connection), CONNECTION_GRACE_MS);
  }

  private close(connection: ExplorerConnection): void {
    clearTimeout(connection.closeTimer);
    if (this.connections.get(connection.serverId) === connection) this.connections.delete(connection.serverId);
    connection.client?.end(true);
    connection.client = undefined;
  }

  private removeHandler(connection: ExplorerConnection, filter: string, onMessage: ExplorerMessageHandler): void {
    const handlers = connection.handlers.get(filter);
    if (!handlers?.delete(onMessage) || handlers.size > 0) return;
    connection.handlers.delete(filter);
    const client = connection.client;
    if (client?.connected) {
      client.unsubscribe(filter, (error) => {
        if (error) this.logger.warn(`Could not release explorer subscription ${filter}`);
      });
    }
  }

  private brokerSubscribe(client: MqttClient, filter: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      client.subscribe(filter, { qos: 0 }, (error) => (error ? reject(error) : resolve()));
    });
  }

  private async connect(connection: ExplorerConnection): Promise<MqttClient> {
    const server = await this.servers.findOneBy({ id: connection.serverId });
    if (!server) throw new Error(`MQTT server with ID ${connection.serverId} not found`);
    const password = await this.mqttClient.resolveServerPassword(server);
    // Client IDs are limited to 23 characters by MQTT 3.1.1: 13 + 10.
    const { url, options, tlsVerificationDisabled } = buildMqttConnectionSettings(server, password, {
      clientId: `attraccess-x-${randomBytes(5).toString('hex')}`,
      clean: true,
      reconnectPeriod: 5000,
    });
    if (tlsVerificationDisabled) {
      this.logger.warn(`TLS certificate verification is disabled for the explorer connection to ${server.name}`);
    }
    if (this.connections.get(connection.serverId) !== connection) throw new Error('Explorer connection closed');

    return new Promise<MqttClient>((resolve, reject) => {
      const client = mqtt.connect(url, options);
      connection.client = client;
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout connecting the explorer to MQTT server ${server.name}`));
      }, CONNECT_TIMEOUT_MS);

      client.on('message', (topic, payload) => {
        for (const [filter, handlers] of connection.handlers) {
          if (!topicMatchesFilter(filter, topic)) continue;
          for (const handler of handlers) handler(topic, payload);
        }
      });
      client.on('error', (error) => {
        this.logger.warn(`Explorer connection error for MQTT server ${server.name}: ${error.message}`);
      });
      let first = true;
      client.on('connect', () => {
        clearTimeout(timeout);
        if (first) {
          first = false;
          resolve(client);
          return;
        }
        // A clean session forgets subscriptions on reconnect.
        for (const filter of connection.handlers.keys()) {
          client.subscribe(filter, { qos: 0 }, (error) => {
            if (error) this.logger.warn(`Could not restore explorer subscription ${filter}`);
          });
        }
      });
    });
  }
}
