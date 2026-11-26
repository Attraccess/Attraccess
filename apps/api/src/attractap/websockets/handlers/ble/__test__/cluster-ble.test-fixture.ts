import type { ClusterService } from '../../../../../cluster/cluster.service';
import type { BusHandler, BusRequestHandler, ClusterBus, ReaderHolder } from '../../../../../cluster/cluster.types';
import {
  ClusterInstanceGoneError,
  ClusterRequestTimeoutError,
  deserializeClusterError,
  serializeClusterError,
} from '../../../../../cluster/cluster-errors';
import type {
  BleWatchDriverEvent,
  BleWatchListener,
  BleWatchState,
} from '../../../../../plugin-system/ble/ble-transport-driver';
import { BleTestDriver, ManualClock } from '../../../../../plugin-system/ble/__test__/ble-test-driver.test-fixture';
import { WebsocketService } from '../../../websocket.service';
import type { AuthenticatedWebSocket } from '../../../websocket.types';
import { ReaderBleDriver } from '../reader-ble.driver';
import { createFakeReaderSocket, type FakeBleReaderFirmware } from './fake-ble-reader.test-fixture';

export const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';
export const INFO = '0000fff1-0000-1000-8000-00805f9b34fb';
export const EVENTS = '0000fff2-0000-1000-8000-00805f9b34fb';
export const BULK = '0000fff3-0000-1000-8000-00805f9b34fb';
export const SLOW = '0000fff4-0000-1000-8000-00805f9b34fb';
export const ADDRESS = 'AA:BB:CC:DD:EE:01';

export const ALLOWLIST = [
  {
    serviceUuid: SERVICE,
    characteristicUuid: INFO,
    operations: ['read' as const, 'write' as const],
    maxReadBytes: 16,
    maxWriteBytes: 8,
    maxNotificationBytes: 0,
  },
  {
    serviceUuid: SERVICE,
    characteristicUuid: EVENTS,
    operations: ['notify' as const],
    maxReadBytes: 0,
    maxWriteBytes: 0,
    maxNotificationBytes: 8,
  },
  {
    serviceUuid: SERVICE,
    characteristicUuid: BULK,
    operations: ['writeWithoutResponse' as const],
    maxReadBytes: 0,
    maxWriteBytes: 512,
    maxNotificationBytes: 0,
  },
  {
    serviceUuid: SERVICE,
    characteristicUuid: SLOW,
    operations: ['read' as const],
    maxReadBytes: 4,
    maxWriteBytes: 0,
    maxNotificationBytes: 0,
  },
];

const CONTEXT = { pluginId: 'plugin-a', profileId: 'demo' };

export const connectRequest = (signal = new AbortController().signal, sessionId = 'session-1') => ({
  readerId: 1,
  address: ADDRESS,
  addressType: 'public' as const,
  timeoutMs: 5_000,
  signal,
  sessionId,
  leaseMs: 60_000,
  allowlist: ALLOWLIST,
  context: CONTEXT,
});

export const scanRequest = (signal = new AbortController().signal) => ({
  readerId: 1,
  filter: { serviceUuids: [SERVICE], manufacturerIds: [] },
  durationMs: 1_000,
  signal,
  context: CONTEXT,
});

/** The in-memory radio around reader 1: one peripheral with a readable, a notifying and a slow characteristic. */
export function createRadio(): BleTestDriver {
  const radio = new BleTestDriver(new ManualClock());
  radio.addPeripheral({
    readerId: 1,
    address: ADDRESS,
    addressType: 'public',
    advertisement: {
      name: 'Demo',
      serviceUuids: [SERVICE],
      manufacturerData: [{ companyId: 7, data: Uint8Array.of(9) }],
    },
    characteristics: { fff1: { value: Uint8Array.of(1, 2, 3) }, fff2: {}, fff3: {}, fff4: { delayMs: 20_000 } },
  });
  return radio;
}

/** One API instance: its reader driver on the given cluster, and the fake reader connections it holds. */
export class BleNode {
  readonly websocketService = new WebsocketService();
  readonly driver: ReaderBleDriver;
  readonly readers = new Map<number, { socket: AuthenticatedWebSocket; firmware: FakeBleReaderFirmware }>();
  private connections = 0;

  constructor(
    readonly name: string,
    readonly cluster: ClusterService,
    private readonly radio: BleTestDriver,
  ) {
    this.driver = new ReaderBleDriver(this.websocketService, undefined, cluster);
  }

  /** The reader signs in here and announces its firmware, as the gateway does. */
  connectReader(readerId = 1): FakeBleReaderFirmware {
    const reader = createFakeReaderSocket({
      id: `${this.name}-socket-${++this.connections}`,
      readerId,
      radio: this.radio,
      deliver: (socket, eventData) => this.driver.handleMessage(socket, eventData),
    });
    this.readers.set(readerId, reader);
    this.websocketService.sockets.set(reader.socket.id, reader.socket);
    this.cluster.presence.socketConnected(readerId, reader.socket.id);
    this.driver.readerConnected(reader.socket);
    this.driver.readerAnnounced(reader.socket);
    return reader.firmware;
  }

  /** The reader's websocket here closes. */
  dropReader(readerId = 1): void {
    const reader = this.readers.get(readerId);
    if (!reader) return;
    this.readers.delete(readerId);
    (reader.socket as unknown as { readyState: number }).readyState = 3;
    this.websocketService.sockets.delete(reader.socket.id);
    reader.firmware.linkLost();
    this.driver.socketClosed(reader.socket);
    this.cluster.presence.socketDisconnected(readerId, reader.socket.id);
  }

  firmware(readerId = 1): FakeBleReaderFirmware {
    const reader = this.readers.get(readerId);
    if (!reader) throw new Error(`reader ${readerId} is not connected to ${this.name}`);
    return reader.firmware;
  }

  sent(type: string, readerId = 1) {
    return this.firmware(readerId).received.filter((message) => message.type === type);
  }

  dispose(): void {
    this.driver.onModuleDestroy();
  }
}

/** Records what a watch listener is told. */
export function watchRecorder() {
  const states: BleWatchState[] = [];
  const events: BleWatchDriverEvent[] = [];
  const listener: BleWatchListener = {
    onWatchState: (_readerId, state) => void states.push(state),
    onWatchEvents: (_readerId, batch) => void events.push(...batch),
  };
  return { states, events, listener, last: () => states[states.length - 1] };
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const copy = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/**
 * Several API instances in one process without Valkey: an in-memory bus that copies every payload through JSON (as
 * Valkey would), reader presence and heartbeats. `kill` stops an instance without a word, as a crash would.
 */
export class FakeClusterNetwork {
  private readonly buses = new Map<string, FakeBus>();
  private readonly holdings = new Map<number, ReaderHolder[]>();
  private readonly connectedHandlers: Array<{ node: string; handler: (readerId: number, instanceId: string) => void }> =
    [];
  readonly dead = new Set<string>();
  private now = 0;

  cluster(name: string): ClusterService {
    const bus = new FakeBus(this, name);
    this.buses.set(name, bus);
    return {
      enabled: true,
      instanceId: name,
      bus,
      instances: { id: name, isAlive: async (id: string) => !this.dead.has(id), onGone: () => undefined },
      presence: {
        socketConnected: (readerId: number) => this.readerConnected(readerId, name),
        socketDisconnected: (readerId: number) =>
          this.holdings.set(
            readerId,
            (this.holdings.get(readerId) ?? []).filter((holder) => holder.instanceId !== name),
          ),
        holders: async (readerId: number) =>
          (this.holdings.get(readerId) ?? [])
            .filter((holder) => !this.dead.has(holder.instanceId))
            .sort((a, b) => b.connectedAt - a.connectedAt),
        onReaderLost: () => undefined,
        onReaderMoved: () => undefined,
        onReaderConnected: (handler: (readerId: number, instanceId: string) => void) =>
          this.connectedHandlers.push({ node: name, handler }),
      },
    } as unknown as ClusterService;
  }

  bus(name: string): FakeBus | undefined {
    return this.dead.has(name) ? undefined : this.buses.get(name);
  }

  kill(name: string): void {
    this.dead.add(name);
    for (const bus of this.buses.values()) bus.failRequestsTo(name);
  }

  private readerConnected(readerId: number, instanceId: string): void {
    const others = (this.holdings.get(readerId) ?? []).filter((holder) => holder.instanceId !== instanceId);
    this.holdings.set(readerId, [...others, { instanceId, connectedAt: ++this.now }]);
    for (const { node, handler } of this.connectedHandlers) if (!this.dead.has(node)) handler(readerId, instanceId);
  }
}

class FakeBus implements ClusterBus {
  private readonly handlers = new Map<string, BusHandler>();
  private readonly requestHandlers = new Map<string, BusRequestHandler>();
  private readonly pending = new Set<{ target: string; reject: (error: Error) => void }>();

  constructor(
    private readonly network: FakeClusterNetwork,
    private readonly name: string,
  ) {}

  on(type: string, handler: BusHandler): void {
    this.handlers.set(type, handler);
  }

  handle(type: string, handler: BusRequestHandler): void {
    this.requestHandlers.set(type, handler);
  }

  async broadcast(): Promise<void> {
    // Presence reaches every instance through the network itself; plugin BLE never broadcasts.
  }

  async send(instanceId: string, type: string, payload: unknown): Promise<void> {
    if (this.network.dead.has(this.name)) return;
    if (instanceId === this.name) return void this.handlers.get(type)?.(payload, this.name);
    const message = copy(payload);
    await Promise.resolve();
    await this.network.bus(instanceId)?.handlers.get(type)?.(message, this.name);
  }

  request<T>(instanceId: string, type: string, payload: unknown, timeoutMs: number): Promise<T> {
    if (instanceId === this.name) return Promise.resolve().then(() => this.answer(type, payload, this.name) as T);
    const target = this.network.bus(instanceId);
    if (!target) return Promise.reject(new ClusterInstanceGoneError(instanceId));
    return new Promise<T>((resolve, reject) => {
      const entry = { target: instanceId, reject };
      this.pending.add(entry);
      const timer = setTimeout(() => {
        this.pending.delete(entry);
        reject(new ClusterRequestTimeoutError(type, instanceId));
      }, timeoutMs);
      timer.unref?.();
      const settle = (outcome: () => void) => {
        if (!this.pending.delete(entry)) return;
        clearTimeout(timer);
        if (!this.network.dead.has(this.name)) outcome();
      };
      const message = copy(payload);
      void Promise.resolve()
        .then(() => target.answer(type, message, this.name))
        .then(
          (value) => settle(() => resolve(copy(value) as T)),
          (error: unknown) => settle(() => reject(deserializeClusterError(serializeClusterError(error)))),
        );
    });
  }

  failRequestsTo(instanceId: string): void {
    for (const entry of [...this.pending]) {
      if (entry.target !== instanceId) continue;
      this.pending.delete(entry);
      entry.reject(new ClusterInstanceGoneError(instanceId));
    }
  }

  private answer(type: string, payload: unknown, from: string): unknown {
    const handler = this.requestHandlers.get(type);
    if (!handler) throw new Error(`No handler for cluster request ${type}`);
    return handler(payload, from);
  }
}
