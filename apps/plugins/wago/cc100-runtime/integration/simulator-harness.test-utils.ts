import { createServer, type Server } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

import { join } from 'node:path';
import { connect, type MqttClient } from 'mqtt';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';

import { WagoSettings } from '../../backend/wago-settings.entity';
import { WagoService } from '../../backend/wago.service';

import { temporary } from './simulator-fixtures.test-utils';
import { createBroker } from './simulator-fixtures.test-utils';

import { prefix } from './simulator-fixtures.test-utils';

import { repository } from './simulator-fixtures.test-utils';

export class SimulatorFixture {
  broker!: ReturnType<typeof createBroker>;

  server!: Server;

  mqtt!: MqttClient;

  child!: ChildProcess | undefined;

  service!: WagoService;

  url!: string;

  errors!: string[];

  messages!: Array<{ topic: string; payload: Buffer; username: string }>;

  connections!: string[];

  disconnectOnRevoke!: boolean;

  onPublishReceived!: (client: any, packet: { topic: string; payload: Buffer }) => void;

  readonly identities = new Map<string, { password: string; publish: string[]; subscribe: string[] }>();

  readonly repositories = new Map<unknown, ReturnType<typeof repository>>();

  readonly matches = (pattern: string, topic: string) => {
    const parts = topic.split('/');
    const filter = pattern.split('/');
    return (
      filter.every((part, index) => part === '#' || part === '+' || part === parts[index]) &&
      (filter.at(-1) === '#' || filter.length === parts.length)
    );
  };

  context!: PluginContext;

  async stop() {
    const active = this.child;
    this.child = undefined;
    if (!active || active.exitCode !== null || active.signalCode !== null) return;
    const exited = once(active, 'exit');
    const fallback = setTimeout(() => active.kill('SIGKILL'), 2000);
    try {
      active.kill('SIGTERM');
      await exited;
    } finally {
      clearTimeout(fallback);
    }
  }

  launch(statePath: string, extra: Record<string, string> = {}, binary = 'simulator.cjs') {
    this.child = spawn(process.execPath, ['--disable-warning=DEP0169', join(temporary, binary)], {
      env: {
        PATH: process.env.PATH,
        WAGO_MQTT_URL: this.url,
        WAGO_STATE_PATH: statePath,
        WAGO_MQTT_PREFIX: 'must-not-change-discovery',
        WAGO_HEARTBEAT_INTERVAL_MS: '150',
        WAGO_MEASUREMENT_INTERVAL_MS: '100',
        WAGO_INITIAL_VALUES: '{"879-3000:0":42}',
        ...extra,
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    this.child.stderr!.on('data', (data) => this.errors.push(data.toString()));
  }

  async readDeviceChannel(channelId: string): Promise<unknown> {
    const active = this.child!;
    const id = `read-${channelId}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const onMessage = (message: { type?: string; id?: string; value?: unknown; error?: string }) => {
        if (message.type !== 'simulator-read-result' || message.id !== id) return;
        clearTimeout(timer);
        active.off('message', onMessage);
        if (message.error) reject(new Error(message.error));
        else resolve(message.value);
      };
      const timer = setTimeout(() => {
        active.off('message', onMessage);
        reject(new Error('device inspection timed out'));
      }, 2000);
      active.on('message', onMessage);
      active.send({ type: 'simulator-read', id, channelId });
    });
  }

  async expectRejectedIdentity(username: string, password?: string, clientId?: string) {
    const unauthorized = connect(this.url, { username, password, clientId, reconnectPeriod: 0 });
    try {
      const rejected = await new Promise<Error>((resolve, reject) => {
        unauthorized.once('error', resolve);
        unauthorized.once('connect', () => reject(new Error('unknown identity connected')));
      });
      expect(rejected.message).toContain('Not authorized');
    } finally {
      await unauthorized.endAsync(true);
    }
  }

  async setup() {
    this.errors = [];
    this.messages = [];
    this.connections = [];
    this.disconnectOnRevoke = false;
    this.onPublishReceived = () => undefined;
    this.repositories.clear();
    this.identities.clear();
    this.broker = createBroker();
    this.broker.authenticate = (client, username, password, done) => {
      const identity = this.identities.get(username);
      client.identity = username;
      done(
        null,
        username === 'integration-admin' ||
          Boolean(identity && client.id === username && identity.password === password?.toString()),
      );
    };
    this.broker.authorizePublish = (client, packet, done) => {
      const allowed =
        client.identity === 'integration-admin' ||
        this.identities.get(client.identity)?.publish.some((pattern) => this.matches(pattern, packet.topic));
      if (allowed) this.onPublishReceived(client, packet);
      done(allowed ? null : new Error('publish denied'));
    };
    this.broker.authorizeSubscribe = (client, subscription, done) => {
      const allowed =
        client.identity === 'integration-admin' ||
        this.identities.get(client.identity)?.subscribe.includes(subscription.topic);
      done(allowed ? null : new Error('subscribe denied'), allowed ? subscription : null);
    };
    this.broker.on('clientReady', (client) => this.connections.push(client.identity));
    this.broker.on('publish', (packet, client) => {
      if (client) this.messages.push({ topic: packet.topic, payload: packet.payload, username: client.identity });
    });
    this.server = createServer(this.broker.handle);
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('expected loopback TCP address');
    this.url = `mqtt://127.0.0.1:${address.port}`;
    this.mqtt = connect(this.url, { username: 'integration-admin', reconnectPeriod: 0 });
    await new Promise<void>((resolve, reject) => {
      this.mqtt.once('connect', () => resolve());
      this.mqtt.once('error', reject);
    });
    this.repositories.set(WagoSettings, repository([{ id: 1, defaultMqttServerId: 1, operationalPrefix: prefix }]));
    this.context = {
      getRepository: (entity: { name: string }) => {
        const existing = [...this.repositories.keys()].find((key: { name: string }) => key.name === entity.name);
        if (existing) return this.repositories.get(existing);
        if (!this.repositories.has(entity)) this.repositories.set(entity, repository());
        return this.repositories.get(entity);
      },
      getMqttServerConfig: async () => ({ host: '127.0.0.1', port: address.port, useTls: false }),
      getMqttCredentialProvisioning: () => ({
        provision: async (request) => {
          const password = `test-${request.username}`;
          this.identities.set(request.username, { password, ...request.topicPolicy });
          return { username: request.username, password };
        },
        revoke: async (request) => {
          this.identities.delete(request.username);
          if (this.disconnectOnRevoke)
            Object.values(this.broker.clients).forEach((client: any) => {
              if (client.identity === request.username) client.conn.destroy();
            });
        },
      }),
      mqtt: {
        publish: async (_server, topic, payload, options) => {
          await this.mqtt.publishAsync(topic, payload, options);
        },
        subscribe: async (_server, topic, listener) => {
          const handler = (received: string, payload: Buffer, packet) => {
            if (this.matches(topic, received))
              Promise.resolve(listener({ topic: received, payload, retain: packet.retain })).catch((error) =>
                this.errors.push(String(error)),
              );
          };
          this.mqtt.on('message', handler);
          await this.mqtt.subscribeAsync(topic, { qos: 1 });
          return { unsubscribe: () => this.mqtt.off('message', handler) };
        },
      },
      logger: { warn: () => undefined },
    } as unknown as PluginContext;
    this.service = new WagoService(this.context);
    await this.service.onApplicationBootstrap();
  }

  async cleanup() {
    await this.stop();
    this.service?.onModuleDestroy();
    await this.mqtt?.endAsync(true);
    await new Promise<void>((resolve) => this.broker.close(resolve));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
