import type { PluginBleContext } from '@attraccess/plugins-backend-sdk';
import type { LoggerService } from '@nestjs/common';
import { Registry } from 'prom-client';
import { createPluginBleMetrics, type PluginBleMetrics } from '../../../../../metrics/definitions/plugin-ble.metrics';
import {
  createHostBleHarness,
  type HostBleHarness,
} from '../../../../../plugin-system/ble/__test__/ble-host-harness.test-fixture';
import { AttractapEventType, type AttractapEvent } from '../../../websocket.types';
import type { ReaderBleChannel } from '../reader-ble-channel';

export const SERVICE = 'fff0';
export const ADDRESS = 'AA:BB:CC:DD:EE:01';
export const OTHER = 'AA:BB:CC:DD:EE:02';

export const capture = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: { code?: string; detail?: string }) => ({ ok: false as const, error }),
  );

export const PROFILE = {
  id: 'demo',
  advertisement: { serviceUuids: [SERVICE] },
  services: [
    {
      uuid: SERVICE,
      characteristics: [
        {
          key: 'info',
          uuid: 'fff1',
          operations: ['read' as const, 'write' as const],
          maxReadBytes: 16,
          maxWriteBytes: 8,
        },
        { key: 'events', uuid: 'fff2', operations: ['notify' as const], maxNotificationBytes: 8 },
        { key: 'bulk', uuid: 'fff3', operations: ['writeWithoutResponse' as const], maxWriteBytes: 512 },
        { key: 'slow', uuid: 'fff4', operations: ['read' as const], maxReadBytes: 4 },
      ],
    },
  ],
  limits: { maxSessionMs: 900_000, maxNotificationQueue: 4 },
};

/**
 * The real `ReaderBleDriver` behind the plugin BLE host, talking protocol v1 to fake reader firmware: reader 1 with
 * two peripherals (`ADDRESS`, `OTHER`), and `PROFILE` registered by `plugin-a` (`ble`) and `plugin-b` (`other`).
 * Registers its own `beforeEach`/`afterEach`; the helpers always act on the current test's harness.
 */
export class ReaderBleSpec {
  harness!: HostBleHarness;
  ble!: PluginBleContext;
  other!: PluginBleContext;

  /** The value, or a test failure: fixtures that must exist. */
  present = <T>(value: T | undefined | null): T => {
    if (value === undefined || value === null) throw new Error('expected a value');
    return value;
  };
  reader = (readerId = 1) => this.present(this.harness.readers.get(readerId));
  driver = () => this.present(this.harness.readerDriver);
  firmware = (readerId = 1) => this.reader(readerId).firmware;
  socket = (readerId = 1) => this.reader(readerId).socket;
  sent = (type: AttractapEventType, readerId = 1) =>
    this.firmware(readerId).received.filter((message) => message.type === type);
  /** A message the reader (firmware) sends, injected as if it arrived on `target`'s socket. */
  fromReader = (
    target: ReturnType<ReaderBleSpec['socket']>,
    type: AttractapEventType,
    payload: Record<string, unknown>,
  ) => this.driver().handleMessage(target, { type, payload } as AttractapEvent['data']);
  endpoint = (address = ADDRESS, ctx = this.ble) =>
    ctx.createEndpoint({ readerId: 1, address, addressType: 'public', profileId: PROFILE.id });
  flush = () => this.harness.advance(0);
  /** Waits through real I/O (the endpoint lookups run on SQLite) until `condition` holds. */
  until = async (condition: () => boolean) => {
    const deadline = Date.now() + 10_000;
    while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(condition()).toBe(true);
  };
  /** The BLE state of the reader's current connection. */
  channel = (readerId = 1) => {
    const channels = (this.driver() as unknown as { channels: WeakMap<object, ReaderBleChannel> }).channels;
    return this.present(channels.get(this.socket(readerId)));
  };
  /** The BLE_RESULT the reader would send for `request`. */
  answer = (request: { payload: Record<string, unknown> }, result: Record<string, unknown>, readerId = 1) =>
    this.fromReader(this.socket(readerId), AttractapEventType.BLE_RESULT, {
      v: 1,
      sessionId: request.payload.sessionId,
      requestId: request.payload.requestId,
      ...result,
    });

  /** Metrics for the host and the driver. Call before the first BLE call of the test (channels keep theirs). */
  withMetrics = (): { registry: Registry; metrics: PluginBleMetrics } => {
    const registry = new Registry();
    const metrics = createPluginBleMetrics(registry);
    (this.driver() as unknown as { metrics: unknown }).metrics = metrics;
    (this.harness.service as unknown as { metrics: unknown }).metrics = metrics;
    return { registry, metrics };
  };

  /** Every line the plugin BLE host logs from now on. */
  serviceLogs = (): string[] => {
    const lines: string[] = [];
    const record = (line: unknown) => void lines.push(String(line));
    const logger: LoggerService = { log: record, warn: record, error: record, debug: record };
    (this.harness.service as unknown as { logger: LoggerService }).logger = logger;
    return lines;
  };

  /** Every line the reader driver logs from now on (channels created later log through it as well). */
  driverLogs = (): string[] => {
    const lines: string[] = [];
    const record = (line: unknown) => void lines.push(String(line));
    const logger: LoggerService = { log: record, warn: record, error: record, debug: record };
    (this.driver() as unknown as { logger: LoggerService }).logger = logger;
    return lines;
  };

  async setUp(): Promise<void> {
    this.harness = await createHostBleHarness({ transport: 'reader-websocket' });
    this.ble = this.harness.contextFor('plugin-a');
    this.other = this.harness.contextFor('plugin-b');
    await this.harness.addReader({ readerId: 1, name: 'Workshop', allowPluginBle: true });
    for (const address of [ADDRESS, OTHER]) {
      this.harness.addPeripheral({
        readerId: 1,
        address,
        addressType: 'public',
        advertisement: { name: 'Demo', serviceUuids: [SERVICE] },
        characteristics: { fff1: { value: Uint8Array.of(1, 2, 3) }, fff2: {}, fff3: {}, fff4: { delayMs: 20_000 } },
      });
    }
    this.ble.registerProfile(PROFILE);
    this.other.registerProfile(PROFILE);
  }
}

export function useReaderBleSpec(): ReaderBleSpec {
  const spec = new ReaderBleSpec();
  beforeEach(() => spec.setUp());
  afterEach(() => spec.harness.dispose());
  return spec;
}
