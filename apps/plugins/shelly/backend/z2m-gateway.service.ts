// zigbee2mqtt gateway client (ATT-789).
//
// Zigbee-capable Shellys (Gen4) never get device-side MQTT config — they join a
// Zigbee network and are reached through the coordinator. Rather than inventing
// a coordinator API we drive the z2m instance from docker-compose over its
// documented MQTT bridge API:
//
//   <base>/bridge/state                       retained  online/offline
//   <base>/bridge/info                        retained  permit_join, permit_join_end
//   <base>/bridge/devices                     retained  full inventory
//   <base>/bridge/event                                 device_joined / device_interview / …
//   <base>/bridge/request/<x>  → <base>/bridge/response/<x>   correlated by `transaction`
//   <base>/<friendly_name>          state published by z2m
//   <base>/<ieee_address>/set       control
//
// Devices are addressed by IEEE address, never friendly name: IEEE is immutable
// and cannot contain `/` (which would fork the topic tree). z2m accepts it
// anywhere a friendly name is accepted.
//
// Connection credentials come from the host through
// `PluginContext.getMqttServerConfig`, gated on ACCESS_MQTT_SERVERS — the plugin
// never reads MQTT server rows itself.
import { EventEmitter } from 'events';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import mqtt, { type MqttClient } from 'mqtt';
import { ZIGBEE_GATEWAY_ROW_ID, ZigbeeGateway } from './zigbee-gateway.entity';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

/** How long to wait for a `bridge/response/…` before giving up on a request. */
const REQUEST_TIMEOUT_MS = 15_000;
/** How long to wait for the broker connection itself. */
const CONNECT_TIMEOUT_MS = 10_000;
/**
 * z2m 2.x caps joining at 254 seconds and removed the permit-forever option, so
 * this is both our default and the hard ceiling.
 */
export const MAX_PERMIT_JOIN_SECONDS = 254;

/** A device as published on the retained `bridge/devices` topic. */
export interface Z2mDevice {
  ieee_address: string;
  friendly_name: string;
  type?: string;
  supported?: boolean;
  model_id?: string;
  interview_state?: 'PENDING' | 'IN_PROGRESS' | 'SUCCESSFUL' | 'FAILED';
  definition?: { model?: string; vendor?: string; description?: string } | null;
}

/** A message on `bridge/event`. */
export interface Z2mBridgeEvent {
  type: 'device_joined' | 'device_interview' | 'device_announce' | 'device_leave';
  data: {
    ieee_address?: string;
    friendly_name?: string;
    /** `device_interview` only — lowercase here, uppercase in `bridge/devices`. */
    status?: 'started' | 'successful' | 'failed';
    supported?: boolean;
    definition?: { model?: string; vendor?: string } | null;
  };
}

export interface GatewayStatus {
  configured: boolean;
  connected: boolean;
  /** z2m itself reported `online` on the retained `bridge/state` topic. */
  bridgeOnline: boolean;
  mqttServerId: number | null;
  baseTopic: string | null;
  deviceCount: number;
  permitJoin: boolean;
  /** Unix seconds at which joining closes, or null when it is not open. */
  permitJoinEnd: number | null;
  /** Why the last connection attempt failed, if it did. */
  error: string | null;
}

/** Raised when an operation needs a gateway but none has been configured yet. */
export class GatewayNotConfiguredError extends Error {
  constructor() {
    super('no zigbee2mqtt gateway is configured');
  }
}

@Injectable()
export class Z2mGatewayService implements OnModuleDestroy {
  private repo: Repository<ZigbeeGateway> | null = null;
  private client: MqttClient | null = null;
  /** The config the live client was opened for, so a config change reconnects. */
  private connectedTo: { mqttServerId: number; baseTopic: string } | null = null;
  private connecting: Promise<MqttClient> | null = null;
  private lastError: string | null = null;

  private bridgeOnline = false;
  private permitJoinState: { permitJoin: boolean; permitJoinEnd: number | null } = {
    permitJoin: false,
    permitJoinEnd: null,
  };
  private devicesByIeee = new Map<string, Z2mDevice>();
  /** Last state payload per device, keyed by IEEE address. */
  private statesByIeee = new Map<string, Record<string, unknown>>();

  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  private transactionCounter = 0;
  /** Internal bus for `bridge/event`; the pairing service is the only consumer. */
  private readonly bus = new EventEmitter();

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }

  // Resolved lazily for the same reason as DeviceRegistryService: plugin
  // providers are constructed before the host DataSource ref is wired up.
  private get gateways(): Repository<ZigbeeGateway> {
    if (this.repo === null) {
      this.repo = this.context.getRepository(ZigbeeGateway);
    }
    return this.repo;
  }

  // ---------------------------------------------------------------- config --

  getConfig(): Promise<ZigbeeGateway | null> {
    return this.gateways.findOne({ where: { id: ZIGBEE_GATEWAY_ROW_ID } });
  }

  async saveConfig(input: { mqttServerId: number; baseTopic: string }): Promise<ZigbeeGateway> {
    const baseTopic = input.baseTopic.trim().replace(/\/+$/, '') || 'zigbee2mqtt';
    await this.gateways.save({
      id: ZIGBEE_GATEWAY_ROW_ID,
      mqttServerId: input.mqttServerId,
      baseTopic,
      updatedAt: new Date().toISOString(),
    });
    // Drop the old connection so the next call picks up the new server/topic.
    this.disconnect();
    const saved = await this.getConfig();
    if (!saved) throw new Error('gateway config vanished right after being saved');
    return saved;
  }

  async status(): Promise<GatewayStatus> {
    const config = await this.getConfig();
    if (!config) {
      return {
        configured: false,
        connected: false,
        bridgeOnline: false,
        mqttServerId: null,
        baseTopic: null,
        deviceCount: 0,
        permitJoin: false,
        permitJoinEnd: null,
        error: null,
      };
    }

    // Best-effort: a broker that is down must not turn the status call into a
    // 502 — reporting "configured but not connected" is the useful answer.
    try {
      await this.ensureConnected();
    } catch {
      /* lastError carries the reason */
    }

    return {
      configured: true,
      connected: this.client?.connected === true,
      bridgeOnline: this.bridgeOnline,
      mqttServerId: config.mqttServerId,
      baseTopic: config.baseTopic,
      deviceCount: this.devicesByIeee.size,
      permitJoin: this.permitJoinState.permitJoin,
      permitJoinEnd: this.permitJoinState.permitJoinEnd,
      error: this.lastError,
    };
  }

  // ------------------------------------------------------------ connection --

  /** Connects if needed and returns the live client. */
  async ensureConnected(): Promise<MqttClient> {
    const config = await this.getConfig();
    if (!config) {
      throw new GatewayNotConfiguredError();
    }

    const changed =
      this.connectedTo !== null &&
      (this.connectedTo.mqttServerId !== config.mqttServerId || this.connectedTo.baseTopic !== config.baseTopic);
    if (changed) {
      this.disconnect();
    }
    if (this.client?.connected) {
      return this.client;
    }
    if (this.connecting) {
      return this.connecting;
    }
    // A client that exists but is not connected is mid-auto-reconnect. Connecting
    // again would leave the old one alive — still reconnecting, still feeding
    // onMessage — so retire it first rather than stacking clients on the broker.
    if (this.client) {
      this.disconnect();
    }

    this.connecting = this.connect(config).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(config: ZigbeeGateway): Promise<MqttClient> {
    // ACCESS_MQTT_SERVERS gates this; the host resolves and decrypts.
    const server = await this.context.getMqttServerConfig(config.mqttServerId);
    if (!server) {
      const message = `MQTT server ${config.mqttServerId} not found`;
      this.lastError = message;
      throw new Error(message);
    }

    const url = `${server.useTls ? 'mqtts' : 'mqtt'}://${server.host}:${server.port}`;
    const client = mqtt.connect(url, {
      clientId: `attraccess-shelly-z2m-${process.pid}`,
      username: server.username ?? undefined,
      password: server.password ?? undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectPeriod: 5000,
      // Retained bridge topics are re-delivered on every (re)connect, so a
      // clean session is enough to rebuild the whole cache.
      clean: true,
    });

    client.on('message', (topic, payload) => this.onMessage(config.baseTopic, topic, payload));
    client.on('error', (err) => {
      this.lastError = err.message;
    });
    client.on('close', () => {
      this.bridgeOnline = false;
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.end(true);
        reject(new Error(`connecting to ${url} timed out after ${CONNECT_TIMEOUT_MS}ms`));
      }, CONNECT_TIMEOUT_MS);
      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('error', (err) => {
        clearTimeout(timer);
        client.end(true);
        reject(err);
      });
    }).catch((err: Error) => {
      this.lastError = err.message;
      throw err;
    });

    const base = config.baseTopic;
    await client.subscribeAsync([
      `${base}/bridge/state`,
      `${base}/bridge/info`,
      `${base}/bridge/devices`,
      `${base}/bridge/event`,
      `${base}/bridge/response/#`,
      // Device state. Our friendly names never contain `/`, so a single level
      // is enough; devices renamed by hand in the z2m UI simply aren't cached.
      `${base}/+`,
    ]);

    this.client = client;
    this.connectedTo = { mqttServerId: config.mqttServerId, baseTopic: config.baseTopic };
    this.lastError = null;
    return client;
  }

  private disconnect(): void {
    this.client?.end(true);
    this.client = null;
    this.connectedTo = null;
    this.bridgeOnline = false;
    this.devicesByIeee.clear();
    this.statesByIeee.clear();
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('gateway connection closed'));
    }
    this.pending.clear();
  }

  // -------------------------------------------------------------- messages --

  /** Exposed for tests: feed a raw broker message through the same path. */
  onMessage(baseTopic: string, topic: string, payload: Buffer | string): void {
    const body = parseJson(payload.toString());
    const suffix = topic.startsWith(`${baseTopic}/`) ? topic.slice(baseTopic.length + 1) : null;
    if (suffix === null) return;

    if (suffix === 'bridge/state') {
      // z2m publishes `{"state":"online"}`; older builds published a bare string.
      const state = typeof body === 'string' ? body : (body as { state?: string } | null)?.state;
      this.bridgeOnline = state === 'online';
      return;
    }

    if (suffix === 'bridge/info') {
      const info = body as { permit_join?: boolean; permit_join_end?: number } | null;
      this.permitJoinState = {
        permitJoin: info?.permit_join === true,
        permitJoinEnd: info?.permit_join_end ?? null,
      };
      return;
    }

    if (suffix === 'bridge/devices') {
      if (!Array.isArray(body)) return;
      this.devicesByIeee = new Map(
        (body as Z2mDevice[])
          .filter((device) => typeof device?.ieee_address === 'string' && device.type !== 'Coordinator')
          .map((device) => [device.ieee_address, device])
      );
      return;
    }

    if (suffix === 'bridge/event') {
      if (body) this.bus.emit('event', body as Z2mBridgeEvent);
      return;
    }

    if (suffix.startsWith('bridge/response/')) {
      this.resolvePending(body);
      return;
    }

    // Anything else at a single level below the base topic is a device state
    // topic, published under the friendly name.
    if (!suffix.includes('/') && body && typeof body === 'object') {
      const device = this.findByFriendlyName(suffix);
      if (device) {
        this.statesByIeee.set(device.ieee_address, body as Record<string, unknown>);
      }
    }
  }

  private resolvePending(body: unknown): void {
    const response = body as { transaction?: unknown; status?: string; error?: string; data?: unknown } | null;
    const transaction = response?.transaction;
    if (typeof transaction !== 'string') return;
    const entry = this.pending.get(transaction);
    if (!entry) return;

    this.pending.delete(transaction);
    clearTimeout(entry.timer);
    if (response?.status === 'error') {
      entry.reject(new Error(response.error || 'zigbee2mqtt rejected the request'));
      return;
    }
    entry.resolve(response?.data);
  }

  // -------------------------------------------------------------- requests --

  /**
   * Publishes to `bridge/request/<path>` and resolves with the `data` of the
   * matching `bridge/response/<path>`, correlated by an echoed `transaction`.
   */
  private async request(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const client = await this.ensureConnected();
    const baseTopic = this.connectedTo?.baseTopic;
    if (!baseTopic) throw new GatewayNotConfiguredError();

    const transaction = `attraccess-${++this.transactionCounter}`;
    const result = new Promise<unknown>((resolve, reject) => {
      // unref: a pending-request watchdog must not keep the process alive.
      const timer = setTimeout(() => {
        this.pending.delete(transaction);
        reject(new Error(`zigbee2mqtt did not answer bridge/request/${path} within ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS).unref();
      this.pending.set(transaction, { resolve, reject, timer });
    });

    await client.publishAsync(`${baseTopic}/bridge/request/${path}`, JSON.stringify({ ...payload, transaction }));
    return result;
  }

  /**
   * Opens the network for joining. z2m 2.x caps this at 254 seconds; pass 0 to
   * close it again.
   */
  async permitJoin(seconds: number): Promise<void> {
    const time = Math.max(0, Math.min(Math.round(seconds), MAX_PERMIT_JOIN_SECONDS));
    await this.request('permit_join', { time });
  }

  /** Renames a device so its topics follow Attraccess, not the z2m UI. */
  async renameDevice(from: string, to: string): Promise<void> {
    await this.request('device/rename', { from, to });
  }

  /**
   * Removes a device from the Zigbee network. Plain removal asks the device to
   * leave and legitimately fails for unreachable devices, so callers that are
   * deleting the Attraccess record fall back to `force` — which drops it from
   * the z2m database only (the device keeps the network key until it is factory
   * reset).
   */
  async removeDevice(ieeeAddress: string, options: { force?: boolean } = {}): Promise<void> {
    await this.request('device/remove', { id: ieeeAddress, force: options.force === true });
  }

  // --------------------------------------------------------- device access --

  listDevices(): Z2mDevice[] {
    return [...this.devicesByIeee.values()];
  }

  /**
   * Re-reads the inventory by re-subscribing: `bridge/devices` is retained, so a
   * fresh SUBSCRIBE re-delivers the current list.
   *
   * The cache is normally kept up to date by z2m's pushes, but a push can be
   * missed — a brief disconnect, or a broker that mishandles retained delivery
   * (aedes drops retained publishes to clients holding several subscriptions,
   * which is how this was found). Re-syncing after we change the inventory
   * ourselves keeps a display bug from outliving the cause.
   */
  async refreshDevices(): Promise<void> {
    const client = await this.ensureConnected();
    const baseTopic = this.connectedTo?.baseTopic;
    if (!baseTopic) throw new GatewayNotConfiguredError();
    await client.unsubscribeAsync(`${baseTopic}/bridge/devices`);
    await client.subscribeAsync(`${baseTopic}/bridge/devices`);
    // The retained payload arrives asynchronously right after the SUBACK.
    await new Promise((resolve) => setTimeout(resolve, 250).unref());
  }

  findByIeee(ieeeAddress: string): Z2mDevice | null {
    return this.devicesByIeee.get(ieeeAddress) ?? null;
  }

  private findByFriendlyName(friendlyName: string): Z2mDevice | null {
    for (const device of this.devicesByIeee.values()) {
      if (device.friendly_name === friendlyName) return device;
    }
    return null;
  }

  /** Last state z2m published for a device, or null if none seen yet. */
  getState(ieeeAddress: string): Record<string, unknown> | null {
    return this.statesByIeee.get(ieeeAddress) ?? null;
  }

  /** Publishes to `<base>/<ieee>/set`, e.g. `{state: 'ON'}`. */
  async setState(ieeeAddress: string, payload: Record<string, unknown>): Promise<void> {
    const client = await this.ensureConnected();
    const baseTopic = this.connectedTo?.baseTopic;
    if (!baseTopic) throw new GatewayNotConfiguredError();
    await client.publishAsync(`${baseTopic}/${ieeeAddress}/set`, JSON.stringify(payload));
  }

  /** Asks z2m to re-publish a device's state (answer arrives on the state topic). */
  async requestState(ieeeAddress: string): Promise<void> {
    const client = await this.ensureConnected();
    const baseTopic = this.connectedTo?.baseTopic;
    if (!baseTopic) throw new GatewayNotConfiguredError();
    await client.publishAsync(`${baseTopic}/${ieeeAddress}/get`, JSON.stringify({ state: '' }));
  }

  // ---------------------------------------------------------------- events --

  /** Subscribes to `bridge/event`. Returns an unsubscribe function. */
  onBridgeEvent(handler: (event: Z2mBridgeEvent) => void): () => void {
    this.bus.on('event', handler);
    return () => this.bus.off('event', handler);
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // z2m publishes bare strings on a few legacy topics; hand them back as-is.
    return raw;
  }
}
