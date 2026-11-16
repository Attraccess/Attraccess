import {
  normalizeBleAddress,
  normalizeBleUuid,
  PluginBleError,
  type FakeBleCharacteristic,
  type FakeBleOperation,
  type FakeBlePeripheral,
  type FakeBleTranscriptEntry,
  type PluginBleAddressType,
  type PluginBleAdvertisement,
  type PluginBleErrorCode,
} from '@attraccess/plugins-backend-sdk';
import type { BleDriverLink, BleTransportDriver } from '../ble-transport-driver';

/** Deterministic clock shared by the test driver and the service under test. */
export class ManualClock {
  private current = 0;
  private seq = 0;
  private timers: Array<{ due: number; seq: number; fn: () => void }> = [];

  now = () => 1_767_225_600_000 + this.current;

  setTimeout = (fn: () => void, ms: number): (() => void) => {
    const timer = { due: this.current + ms, seq: this.seq++, fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((candidate) => candidate !== timer);
    };
  };

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    await flush();
    for (;;) {
      const next = this.timers.filter((t) => t.due <= target).sort((a, b) => a.due - b.due || a.seq - b.seq)[0];
      if (!next) break;
      this.timers = this.timers.filter((t) => t !== next);
      this.current = Math.max(this.current, next.due);
      next.fn();
      await flush();
    }
    this.current = target;
    await flush();
  }
}

export async function flush(rounds = 100): Promise<void> {
  for (let index = 0; index < rounds; index++) await Promise.resolve();
}

interface LinkState {
  readerId: number;
  address: string;
  subscribers: Map<string, (b: Uint8Array) => void>;
  lost: Array<() => void>;
}

interface Peripheral {
  readerIds: Set<number>;
  addressType: PluginBleAddressType;
  advertisement: FakeBlePeripheral['advertisement'];
  characteristics: Map<string, FakeBleCharacteristic>;
}

/**
 * In-memory stand-in for the reader transport ATT-1033 will implement. It records every primitive it receives, so
 * tests can prove that rejected calls never reached it.
 */
export class BleTestDriver implements BleTransportDriver {
  readonly transcript: FakeBleTranscriptEntry[] = [];
  readonly available = new Map<number, boolean>();
  private readonly peripherals = new Map<string, Peripheral>();
  private readonly failures = new Map<FakeBleOperation, PluginBleError[]>();
  private readonly syncFailures = new Map<FakeBleOperation, Error[]>();
  /** Every live link, one per connect, so two sessions to one address (through two readers) stay apart. */
  private readonly links = new Set<LinkState>();
  /** How long `connect` takes, in fake time. */
  connectDelayMs = 0;
  /** `false` simulates a transport that ignores the abort signal, so its link arrives after the host gave up. */
  connectHonoursAbort = true;

  constructor(private readonly clock: ManualClock) {}

  /** Makes the next call of `op` throw synchronously (not reject), like a careless driver would. */
  throwSyncNext(
    op: FakeBleOperation,
    error: Error = new PluginBleError('GATT_ERROR', `Injected sync ${op} throw`),
  ): void {
    const queue = this.syncFailures.get(op) ?? [];
    queue.push(error);
    this.syncFailures.set(op, queue);
  }

  private throwIfSyncFailure(op: FakeBleOperation): void {
    const failure = this.syncFailures.get(op)?.shift();
    if (failure) throw failure;
  }

  addPeripheral(peripheral: FakeBlePeripheral): void {
    const characteristics = new Map<string, FakeBleCharacteristic>();
    for (const [uuid, spec] of Object.entries(peripheral.characteristics ?? {})) {
      characteristics.set(normalizeBleUuid(uuid), { ...spec });
    }
    this.peripherals.set(normalizeBleAddress(peripheral.address), {
      readerIds: new Set(peripheral.readerIds ?? (peripheral.readerId === undefined ? [] : [peripheral.readerId])),
      addressType: peripheral.addressType,
      advertisement: peripheral.advertisement,
      characteristics,
    });
  }

  failNext(op: FakeBleOperation, code: PluginBleErrorCode, detail?: string): void {
    const queue = this.failures.get(op) ?? [];
    queue.push(new PluginBleError(code, `Injected ${code} failure`, { operation: op, detail }));
    this.failures.set(op, queue);
  }

  /** Delivers to every live link to the address, whichever reader it runs through. */
  notify(address: string, uuid: string, bytes: Uint8Array): void {
    const normalized = normalizeBleAddress(address);
    const characteristicUuid = normalizeBleUuid(uuid);
    for (const link of [...this.links]) {
      if (link.address === normalized) link.subscribers.get(characteristicUuid)?.(Uint8Array.from(bytes));
    }
  }

  /** The peripheral drops every link to it (or only the one through `readerId`). */
  dropLink(address: string, readerId?: number): void {
    const normalized = normalizeBleAddress(address);
    for (const link of [...this.links]) {
      if (link.address !== normalized || (readerId !== undefined && link.readerId !== readerId)) continue;
      this.links.delete(link);
      link.lost.forEach((listener) => listener());
    }
  }

  /** Number of links the driver still holds (a leaked link stays counted). */
  get liveLinks(): number {
    return this.links.size;
  }

  isReaderAvailable(readerId: number): boolean {
    return this.available.get(readerId) ?? true;
  }

  private record(entry: FakeBleTranscriptEntry): void {
    this.transcript.push(entry);
    const failure = this.failures.get(entry.op)?.shift();
    if (failure) throw failure;
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new PluginBleError('CANCELLED', 'cancelled'));
      const cancel = this.clock.setTimeout(() => (signal.removeEventListener('abort', onAbort), resolve()), ms);
      const onAbort = () => (cancel(), reject(new PluginBleError('CANCELLED', 'cancelled')));
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async scan(request: Parameters<BleTransportDriver['scan']>[0]): Promise<PluginBleAdvertisement[]> {
    this.record({ op: 'scan', readerId: request.readerId, durationMs: request.durationMs });
    // Deliberately unfiltered: core must apply the profile filter itself.
    return [...this.peripherals.entries()]
      .filter(([, peripheral]) => peripheral.readerIds.has(request.readerId))
      .map(([address, peripheral]) => ({
        address,
        addressType: peripheral.addressType,
        rssi: peripheral.advertisement.rssi,
        name: peripheral.advertisement.name,
        serviceUuids: peripheral.advertisement.serviceUuids ?? [],
        manufacturerData: peripheral.advertisement.manufacturerData ?? [],
      }));
  }

  connect(request: Parameters<BleTransportDriver['connect']>[0]): Promise<BleDriverLink> {
    this.throwIfSyncFailure('connect');
    return this.connectAsync(request);
  }

  private async connectAsync(request: Parameters<BleTransportDriver['connect']>[0]): Promise<BleDriverLink> {
    const { readerId, address, addressType, signal } = request;
    this.record({ op: 'connect', readerId, address, addressType });
    const peripheral = this.peripherals.get(address);
    if (!peripheral || !peripheral.readerIds.has(readerId)) {
      throw new PluginBleError('DEVICE_NOT_FOUND', 'The device was not found near the reader');
    }
    if (this.connectDelayMs > 0) {
      await this.sleep(this.connectDelayMs, this.connectHonoursAbort ? signal : new AbortController().signal);
    }
    const state: LinkState = { readerId, address, subscribers: new Map(), lost: [] };
    this.links.add(state);
    const characteristic = (uuid: string) => {
      const found = peripheral.characteristics.get(uuid);
      if (!found) throw new PluginBleError('GATT_ERROR', 'Characteristic not found on the device');
      return found;
    };
    const delayed = async (spec: FakeBleCharacteristic, signal: AbortSignal) => {
      if (spec.delayMs) await this.sleep(spec.delayMs, signal);
    };
    const link: BleDriverLink = {
      read: async ({ serviceUuid, characteristicUuid, signal }) => {
        this.record({ op: 'read', readerId, address, serviceUuid, characteristicUuid });
        const spec = characteristic(characteristicUuid);
        await delayed(spec, signal);
        return spec.onRead ? spec.onRead() : (spec.value ?? new Uint8Array());
      },
      write: async ({ serviceUuid, characteristicUuid, value, withoutResponse, signal }) => {
        this.record({ op: 'write', readerId, address, serviceUuid, characteristicUuid, bytes: value, withoutResponse });
        const spec = characteristic(characteristicUuid);
        await delayed(spec, signal);
        if (spec.onWrite) await spec.onWrite(value, { withoutResponse });
        else spec.value = Uint8Array.from(value);
      },
      subscribe: async ({ serviceUuid, characteristicUuid, indicate, signal, onNotification }) => {
        this.record({ op: 'subscribe', readerId, address, serviceUuid, characteristicUuid, indicate });
        await delayed(characteristic(characteristicUuid), signal);
        state.subscribers.set(characteristicUuid, onNotification);
      },
      unsubscribe: async ({ serviceUuid, characteristicUuid }) => {
        this.record({ op: 'unsubscribe', readerId, address, serviceUuid, characteristicUuid });
        state.subscribers.delete(characteristicUuid);
      },
      disconnect: async () => {
        this.links.delete(state);
        this.record({ op: 'disconnect', readerId, address });
      },
      onDisconnected: (listener) => void state.lost.push(listener),
    };
    // Each call can be made to throw synchronously before its async body runs.
    const guard =
      <A, R>(op: FakeBleOperation, call: (request: A) => Promise<R>) =>
      (request: A): Promise<R> => {
        this.throwIfSyncFailure(op);
        return call(request);
      };
    return {
      ...link,
      read: guard('read', link.read),
      write: guard('write', link.write),
      subscribe: guard('subscribe', link.subscribe),
      unsubscribe: guard('unsubscribe', link.unsubscribe),
      disconnect: () => {
        this.throwIfSyncFailure('disconnect');
        return link.disconnect();
      },
    };
  }
}
