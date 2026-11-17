import { PluginBleError } from '@attraccess/plugins-backend-sdk';
import type { BleDriverLink } from '../../../../../plugin-system/ble/ble-transport-driver';
import { BleTestDriver } from '../../../../../plugin-system/ble/__test__/ble-test-driver.test-fixture';
import { AttractapEventType, type AttractapEvent, type AuthenticatedWebSocket } from '../../../websocket.types';
import { decodeBleBytes, encodeBleBytes, parseBleCapability } from '../ble-wire';

/** What a real reader announces in READER_FIRMWARE_INFO.capabilities.ble (protocol v1). */
export const FAKE_READER_BLE_CAPABILITY = {
  version: 1,
  operations: ['scan', 'connect', 'read', 'write', 'writeWithoutResponse', 'subscribe', 'unsubscribe', 'cancel'],
  maxConnections: 1,
  maxMtu: 517,
  maxPayloadBytes: 512,
  maxNotificationQueue: 64,
  maxScanMs: 15_000,
  maxScanResults: 32,
  maxAllowlistEntries: 16,
  maxPendingRequests: 16,
};

type Payload = Record<string, unknown>;

interface AllowlistEntry {
  s: string;
  c: string;
  ops: number;
  r: number;
  w: number;
  n: number;
}

interface Session {
  sessionId: string;
  address: string;
  allowlist: AllowlistEntry[];
  link: BleDriverLink | null;
  /** Operations run one at a time, like the firmware's BLE task. */
  tail: Promise<unknown>;
  /** Per subscription (the BLE_SUBSCRIBE requestId): its service, characteristic and the last `seq` sent. */
  subscriptions: Map<number, { s: string; c: string; seq: number }>;
}

/**
 * The reader firmware's BLE proxy as far as the API can see it: protocol v1 over a fake socket, backed by the
 * in-memory radio (`BleTestDriver`, which records the transcript, injects failures and delays). It enforces the
 * firmware rules the API relies on: one owner, the allowlist, serialized operations, cancellation and `seq`.
 */
export class FakeBleReaderFirmware {
  /** Every message the API sent, in order (type + payload). */
  readonly received: Array<{ type: string; payload: Payload }> = [];
  private scan: { sessionId: string; controller: AbortController } | null = null;
  private session: Session | null = null;
  private readonly running = new Map<number, AbortController>();
  /** Set to drop answers (simulates a reader that went silent). */
  silent = false;

  constructor(
    readonly readerId: number,
    private readonly radio: BleTestDriver,
    private readonly answer: (type: AttractapEventType, payload: Payload, sync?: boolean) => void,
  ) {}

  receive(type: string, payload: Payload): void {
    this.received.push({ type, payload });
    if (payload.v !== 1) {
      if (typeof payload.requestId === 'number') this.fail(payload, 'INVALID_ARGUMENT', 'protocol-version');
      return;
    }
    switch (type) {
      case AttractapEventType.BLE_SCAN:
        return void this.onScan(payload);
      case AttractapEventType.BLE_SESSION_OPEN:
        return void this.onOpen(payload);
      case AttractapEventType.BLE_CANCEL:
        return this.onCancel(payload);
      case AttractapEventType.BLE_SESSION_CLOSE:
        return this.onClose(payload);
      default:
        return this.onOperation(type, payload);
    }
  }

  /** The websocket dropped: like the firmware, the session ends and the peripheral is disconnected at once. */
  linkLost(): void {
    this.scan?.controller.abort();
    this.scan = null;
    const session = this.session;
    this.session = null;
    void session?.link?.disconnect().catch(() => undefined);
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  private reply(payload: Payload, result: Payload, type = AttractapEventType.BLE_RESULT): void {
    if (this.silent) return;
    this.answer(type, { v: 1, sessionId: payload.sessionId, requestId: payload.requestId, ...result });
  }

  private fail(payload: Payload, code: string, detail?: string, type = AttractapEventType.BLE_RESULT): void {
    this.reply(payload, { ok: false, error: { code, detail } }, type);
  }

  private failWith(payload: Payload, error: unknown, type = AttractapEventType.BLE_RESULT): void {
    const failure = error instanceof PluginBleError ? error : new PluginBleError('INTERNAL', 'failed');
    this.fail(payload, failure.code, failure.detail, type);
  }

  private busy(): boolean {
    return this.scan !== null || this.session !== null;
  }

  private async onScan(payload: Payload): Promise<void> {
    if (this.busy()) return this.fail(payload, 'READER_BUSY', 'busy', AttractapEventType.BLE_SCAN_RESULT);
    const controller = new AbortController();
    this.scan = { sessionId: payload.sessionId as string, controller };
    this.running.set(payload.requestId as number, controller);
    try {
      const filter = payload.filter as { serviceUuids: string[]; manufacturerIds: number[]; namePrefix?: string };
      const found = await this.radio.scan({
        readerId: this.readerId,
        filter,
        durationMs: payload.durationMs as number,
        signal: controller.signal,
        context: { pluginId: 'reader', profileId: 'reader' },
      });
      if (controller.signal.aborted) return;
      const advertisements = found.map((ad) => ({
        ...ad,
        manufacturerData: ad.manufacturerData.map((entry) => ({ ...entry, data: encodeBleBytes(entry.data) })),
      }));
      this.reply(payload, { ok: true, advertisements }, AttractapEventType.BLE_SCAN_RESULT);
    } catch (error) {
      if (!controller.signal.aborted) this.failWith(payload, error, AttractapEventType.BLE_SCAN_RESULT);
    } finally {
      this.running.delete(payload.requestId as number);
      if (this.scan?.controller === controller) this.scan = null;
    }
  }

  private async onOpen(payload: Payload): Promise<void> {
    if (this.busy()) return this.fail(payload, 'READER_BUSY', 'busy');
    const session: Session = {
      sessionId: payload.sessionId as string,
      address: payload.address as string,
      allowlist: payload.allowlist as AllowlistEntry[],
      link: null,
      tail: Promise.resolve(),
      subscriptions: new Map(),
    };
    this.session = session;
    const controller = new AbortController();
    this.running.set(payload.requestId as number, controller);
    try {
      const link = await this.radio.connect({
        readerId: this.readerId,
        address: session.address,
        addressType: payload.addressType as 'public' | 'random',
        timeoutMs: payload.connectTimeoutMs as number,
        signal: controller.signal,
        sessionId: session.sessionId,
        leaseMs: payload.leaseMs as number,
        allowlist: [],
        context: { pluginId: 'reader', profileId: 'reader' },
      });
      if (controller.signal.aborted || this.session !== session) {
        await link.disconnect();
        return;
      }
      session.link = link;
      link.onDisconnected(() => {
        if (this.session !== session) return;
        this.session = null;
        this.answer(AttractapEventType.BLE_SESSION_ENDED, {
          v: 1,
          sessionId: session.sessionId,
          reason: 'disconnected',
          detail: 'reason:0x13',
        });
      });
      this.reply(payload, { ok: true, mtu: link.mtu });
    } catch (error) {
      if (this.session === session) this.session = null;
      if (!controller.signal.aborted) this.failWith(payload, error);
    } finally {
      this.running.delete(payload.requestId as number);
    }
  }

  private onCancel(payload: Payload): void {
    const controller = this.running.get(payload.requestId as number);
    if (!controller) return;
    this.running.delete(payload.requestId as number);
    controller.abort();
    if (this.scan?.controller === controller) {
      this.scan = null;
      return this.fail(payload, 'CANCELLED', undefined, AttractapEventType.BLE_SCAN_RESULT);
    }
    // A cancelled connect releases the session; a GATT operation stays serialized, its late result is discarded.
    if (this.session?.sessionId === payload.sessionId && !this.session.link) this.session = null;
    this.fail(payload, 'CANCELLED');
  }

  private onClose(payload: Payload): void {
    const session = this.session;
    if (!session || session.sessionId !== payload.sessionId)
      return this.fail(payload, 'SESSION_CLOSED', 'unknown-session');
    this.session = null;
    for (const controller of this.running.values()) controller.abort();
    void (session.link?.disconnect() ?? Promise.resolve()).then(
      () => this.reply(payload, { ok: true }),
      (error) => this.failWith(payload, error),
    );
  }

  private onOperation(type: string, payload: Payload): void {
    const session = this.session;
    if (!session || session.sessionId !== payload.sessionId || !session.link) {
      return this.fail(payload, 'SESSION_CLOSED', 'unknown-session');
    }
    // Firmware 2.4.0 as first built required the deadline on every operation; the API must always send it.
    if (typeof payload.timeoutMs !== 'number') return this.fail(payload, 'INVALID_ARGUMENT', 'malformed');
    const entry = session.allowlist.find((candidate) => candidate.s === payload.s && candidate.c === payload.c);
    if (!entry) return this.fail(payload, 'UNKNOWN_CHARACTERISTIC', 'not-in-allowlist');
    const controller = new AbortController();
    const requestId = payload.requestId as number;
    this.running.set(requestId, controller);
    const link = session.link;
    const ref = { serviceUuid: entry.s, characteristicUuid: entry.c, signal: controller.signal };
    const run = async (): Promise<Payload> => {
      switch (type) {
        case AttractapEventType.BLE_READ: {
          if (!(entry.ops & 1)) throw new PluginBleError('OPERATION_NOT_ALLOWED', 'no', { detail: 'read' });
          const value = await link.read(ref);
          if (value.length > entry.r) throw new PluginBleError('PAYLOAD_TOO_LARGE', 'read', { detail: 'max-read' });
          return { value: encodeBleBytes(value) };
        }
        case AttractapEventType.BLE_WRITE: {
          const withoutResponse = payload.withoutResponse === true;
          if (!(entry.ops & (withoutResponse ? 4 : 2))) {
            throw new PluginBleError('OPERATION_NOT_ALLOWED', 'no', { detail: 'write' });
          }
          const value = decodeBleBytes(payload.value, 512);
          if (!value || value.length > entry.w) throw new PluginBleError('PAYLOAD_TOO_LARGE', 'write');
          if (withoutResponse && value.length > (link.mtu ?? 23) - 3) {
            throw new PluginBleError('PAYLOAD_TOO_LARGE', 'write', { detail: 'exceeds-mtu' });
          }
          await link.write({ ...ref, value, withoutResponse });
          return {};
        }
        case AttractapEventType.BLE_SUBSCRIBE: {
          if (!(entry.ops & (payload.indicate ? 16 : 8))) {
            throw new PluginBleError('OPERATION_NOT_ALLOWED', 'no', { detail: 'subscribe' });
          }
          session.subscriptions.set(requestId, { s: entry.s, c: entry.c, seq: 0 });
          await link.subscribe({
            ...ref,
            indicate: payload.indicate === true,
            onNotification: (value) => this.notify(session, requestId, entry, value),
          });
          return {};
        }
        case AttractapEventType.BLE_UNSUBSCRIBE:
          for (const [id, subscription] of session.subscriptions) {
            if (subscription.s === entry.s && subscription.c === entry.c) session.subscriptions.delete(id);
          }
          await link.unsubscribe({ serviceUuid: entry.s, characteristicUuid: entry.c });
          return {};
        default:
          throw new PluginBleError('INVALID_ARGUMENT', 'unknown type');
      }
    };
    const step = session.tail.then(async () => {
      if (controller.signal.aborted) return;
      try {
        const result = await run();
        if (!controller.signal.aborted) this.reply(payload, { ok: true, ...result });
      } catch (error) {
        if (!controller.signal.aborted) this.failWith(payload, error);
      } finally {
        this.running.delete(requestId);
      }
    });
    session.tail = step.catch(() => undefined);
  }

  private notify(session: Session, subscriptionId: number, entry: AllowlistEntry, value: Uint8Array): void {
    const subscription = session.subscriptions.get(subscriptionId);
    if (this.session !== session || !subscription) return;
    const seq = ++subscription.seq;
    const base = { v: 1, sessionId: session.sessionId, subscriptionId, seq };
    if (value.length > entry.n) {
      session.subscriptions.delete(subscriptionId);
      return this.answer(
        AttractapEventType.BLE_NOTIFICATION,
        { ...base, error: { code: 'PAYLOAD_TOO_LARGE', detail: 'max-notification' } },
        true,
      );
    }
    // Synchronous, like the in-memory driver: tests notify and then read the stream.
    this.answer(AttractapEventType.BLE_NOTIFICATION, { ...base, value: encodeBleBytes(value) }, true);
  }
}

/** A reader connection the driver can use: its `sendRaw` feeds the fake firmware, its answers go to `deliver`. */
export function createFakeReaderSocket(options: {
  id: string;
  readerId: number;
  radio: BleTestDriver;
  deliver: (socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) => void;
  capability?: unknown;
}): { socket: AuthenticatedWebSocket; firmware: FakeBleReaderFirmware } {
  const socket = {
    id: options.id,
    readerId: options.readerId,
    readyState: 1,
    // A paired reader: plugin BLE only travels on the session transport.
    transport: 'session',
    state: { pairingRequired: false, ble: parseBleCapability(options.capability ?? FAKE_READER_BLE_CAPABILITY) },
  } as unknown as AuthenticatedWebSocket;
  const firmware = new FakeBleReaderFirmware(options.readerId, options.radio, (type, payload, sync) => {
    const eventData = { type, payload } as AttractapEvent['data'];
    if (sync) options.deliver(socket, eventData);
    // Answers arrive later than the request was sent, like on a real socket.
    else void Promise.resolve().then(() => options.deliver(socket, eventData));
  });
  socket.sendRaw = (message: AttractapEvent) => {
    if (socket.readyState !== 1) return false;
    firmware.receive(message.data.type, message.data.payload as Payload);
    return true;
  };
  return { socket, firmware };
}
