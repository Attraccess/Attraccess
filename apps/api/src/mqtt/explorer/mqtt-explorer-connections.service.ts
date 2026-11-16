import { MqttServer } from '@attraccess/database-entities';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { Repository } from 'typeorm';
import { buildMqttConnectionSettings } from '../mqtt-connection-options';
import { MqttClientService } from '../mqtt-client.service';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { CONNECT_TIMEOUT_MS, CONNECTION_GRACE_MS, topicMatchesFilter } from './mqtt-explorer.constants';

/** `failed`: the broker refused or dropped the connection or subscription. `reset`: the server changed or the API stops. */
export type ExplorerFailureCause = 'failed' | 'reset';

/** The connection was closed on purpose: its server changed or was deleted, or the API is stopping. */
export class ExplorerConnectionReset extends Error {
  constructor() {
    super('The explorer connection was reset');
    this.name = 'ExplorerConnectionReset';
  }
}

export interface ExplorerViewer {
  onMessage(topic: string, payload: Buffer): void;
  /**
   * The connection is gone and will not come back. May be called while the
   * viewer's subscribe() is still pending; that promise then rejects as well.
   */
  onError(cause: ExplorerFailureCause): void;
}

export interface ExplorerSubscription {
  unsubscribe(): void;
}

interface ExplorerConnection {
  readonly key: string;
  readonly serverId: number;
  readonly filter: string;
  readonly viewers: Set<ExplorerViewer>;
  /** Connected and subscribed. */
  readonly ready: Promise<void>;
  readonly settle: { resolve(): void; reject(error: Error): void };
  client?: MqttClient;
  connectTimer?: ReturnType<typeof setTimeout>;
  closeTimer?: ReturnType<typeof setTimeout>;
  failure?: Error;
  closed: boolean;
}

/**
 * The explorer's own broker connections, one per watched (server, filter).
 *
 * Explorer messages must not share the flow connection: every message on that
 * one fires the flow trigger dispatcher (a query per message), so a `#` filter
 * would load the API. And each filter gets its own connection because brokers
 * such as Mosquitto, EMQX and HiveMQ deliver one copy per matching subscription:
 * overlapping filters on one connection would show duplicates, and a retained
 * message sent for a new subscription would appear under an older one.
 *
 * A connection is shared by every viewer of its filter, opens with the first
 * one and closes CONNECTION_GRACE_MS after the last one left.
 */
@Injectable()
export class MqttExplorerConnectionsService implements OnModuleDestroy {
  private readonly logger = new Logger(MqttExplorerConnectionsService.name);
  private readonly connections = new Map<string, ExplorerConnection>();

  constructor(
    @InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>,
    private readonly mqttClient: MqttClientService,
  ) {}

  onModuleDestroy(): void {
    for (const connection of [...this.connections.values()]) this.fail(connection, new ExplorerConnectionReset());
  }

  get openConnectionCount(): number {
    return this.connections.size;
  }

  /** Resolves once the broker acknowledged the subscription; joiners of a pending one share its outcome. */
  async subscribe(serverId: number, filter: string, viewer: ExplorerViewer): Promise<ExplorerSubscription> {
    const connection = this.acquire(serverId, filter);
    // Before the SUBACK: retained messages arrive right behind it.
    connection.viewers.add(viewer);
    try {
      await connection.ready;
      if (connection.failure) throw connection.failure;
    } catch (error) {
      this.detach(connection, viewer);
      throw error;
    }
    return { unsubscribe: () => this.detach(connection, viewer) };
  }

  @OnEvent(MqttServerChangedEvent.EVENT_NAME)
  onServerChanged(event: MqttServerChangedEvent): void {
    this.resetServer(event.serverId);
  }

  /** Closes the server's explorer connections and fails their viewers; the next viewer connects with the current settings. */
  resetServer(serverId: number): void {
    for (const connection of [...this.connections.values()]) {
      if (connection.serverId === serverId) this.fail(connection, new ExplorerConnectionReset());
    }
  }

  private acquire(serverId: number, filter: string): ExplorerConnection {
    const key = JSON.stringify([serverId, filter]);
    const existing = this.connections.get(key);
    if (existing) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = undefined;
      return existing;
    }
    let settle!: ExplorerConnection['settle'];
    const ready = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
    // Reported to whoever awaits `ready`; do not leave it unhandled.
    ready.catch(() => undefined);
    const connection: ExplorerConnection = { key, serverId, filter, viewers: new Set(), ready, settle, closed: false };
    connection.connectTimer = setTimeout(
      () => this.fail(connection, new Error('Timeout connecting the explorer')),
      CONNECT_TIMEOUT_MS,
    );
    this.connections.set(key, connection);
    this.connect(connection).catch((error: Error) => this.fail(connection, error));
    return connection;
  }

  private detach(connection: ExplorerConnection, viewer: ExplorerViewer): void {
    if (!connection.viewers.delete(viewer) || connection.viewers.size > 0 || connection.closed) return;
    connection.closeTimer = setTimeout(
      () => this.close(connection, new ExplorerConnectionReset()),
      CONNECTION_GRACE_MS,
    );
  }

  private close(connection: ExplorerConnection, reason: Error): void {
    connection.closed = true;
    connection.failure ??= reason;
    clearTimeout(connection.closeTimer);
    clearTimeout(connection.connectTimer);
    if (this.connections.get(connection.key) === connection) this.connections.delete(connection.key);
    connection.settle.reject(connection.failure);
    connection.client?.end(true);
    connection.client = undefined;
  }

  private fail(connection: ExplorerConnection, error: Error): void {
    if (connection.closed) return;
    if (!(error instanceof ExplorerConnectionReset)) {
      this.logger.warn(`Explorer connection to MQTT server ${connection.serverId} failed: ${error.message}`);
    }
    this.close(connection, error);
    const viewers = [...connection.viewers];
    connection.viewers.clear();
    const cause: ExplorerFailureCause = error instanceof ExplorerConnectionReset ? 'reset' : 'failed';
    for (const viewer of viewers) viewer.onError(cause);
  }

  private brokerSubscribe(client: MqttClient, filter: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      client.subscribe(filter, { qos: 0 }, (error) => (error ? reject(error) : resolve()));
    });
  }

  private async connect(connection: ExplorerConnection): Promise<void> {
    const server = await this.servers.findOneBy({ id: connection.serverId });
    if (!server) throw new Error(`MQTT server with ID ${connection.serverId} not found`);
    const password = await this.mqttClient.resolveServerPassword(server);
    if (connection.closed) return;
    // Client IDs are limited to 23 characters by MQTT 3.1.1: 13 + 10.
    const { url, options, tlsVerificationDisabled } = buildMqttConnectionSettings(server, password, {
      clientId: `attraccess-x-${randomBytes(5).toString('hex')}`,
      clean: true,
      reconnectPeriod: 5000,
      // Every (re)connect subscribes below, so a refused subscription is noticed.
      resubscribe: false,
    });
    if (tlsVerificationDisabled) {
      this.logger.warn(`TLS certificate verification is disabled for the explorer connection to ${server.name}`);
    }

    const client = mqtt.connect(url, options);
    connection.client = client;
    const { filter } = connection;
    client.on('message', (topic, payload) => {
      // The connection carries only this filter; the match is a safety net.
      if (connection.closed || !topicMatchesFilter(filter, topic)) return;
      for (const viewer of [...connection.viewers]) viewer.onMessage(topic, payload);
    });
    client.on('error', (error) => {
      this.logger.warn(`Explorer connection error for MQTT server ${server.name}: ${error.message}`);
    });
    client.on('close', () => {
      // mqtt.js stops reconnecting for good once the broker refused the connection (CONNACK error).
      if ((client as unknown as { reconnectSuppressed?: boolean }).reconnectSuppressed) {
        this.fail(connection, new Error('The broker refused the explorer connection'));
      }
    });
    // A clean session forgets the subscription, so every connect subscribes again.
    client.on('connect', () => {
      this.brokerSubscribe(client, filter).then(
        () => {
          clearTimeout(connection.connectTimer);
          connection.settle.resolve();
        },
        (error: Error) => this.fail(connection, error),
      );
    });
  }
}
