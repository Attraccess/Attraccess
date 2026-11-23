import type { PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import type { LoggerService } from '@nestjs/common';
import type { ClusterBus } from '../../../../cluster/cluster.types';
import { serializeClusterError } from '../../../../cluster/cluster-errors';
import type {
  BleDriverLink,
  BleReaderStatus,
  BleTransportDriver,
} from '../../../../plugin-system/ble/ble-transport-driver';
import {
  BleClusterMessage,
  cancelledError,
  decodeBytes,
  encodeAdvertisement,
  encodeBytes,
  readerLinkLost,
  type WireAdvertisement,
} from './ble-cluster-wire';

type ScanRequest = Parameters<BleTransportDriver['scan']>[0];
type ConnectRequest = Parameters<BleTransportDriver['connect']>[0];

/** What the holder runs for another instance: the reader driver's own local paths. */
export interface LocalBleWork {
  readerStatus(readerId: number): BleReaderStatus;
  scan(request: ScanRequest): Promise<PluginBleAdvertisement[]>;
  connect(request: ConnectRequest): Promise<BleDriverLink>;
}

interface ServedLink {
  origin: string;
  linkId: string;
  link: BleDriverLink;
}

interface LinkCall {
  linkId: string;
  opId: string;
  op: 'read' | 'write' | 'subscribe' | 'unsubscribe' | 'disconnect';
  serviceUuid: string;
  characteristicUuid: string;
  timeoutMs?: number;
  value?: string;
  withoutResponse?: boolean;
  indicate?: boolean;
  subscriptionId?: number;
}

const key = (origin: string, id: string) => `${origin} ${id}`;

/**
 * The holder's side of plugin BLE for other instances (ATT-1163): it runs their scans, connects and link operations
 * on its reader sockets and keeps the links it serves per origin. A link ends when it closes, when the reader loses
 * it (the origin is told), and when its origin is gone (`dropOrigin`, from the router's periodic check).
 */
export class ServedBleWork {
  private readonly links = new Map<string, ServedLink>();
  private readonly ops = new Map<string, { origin: string; controller: AbortController }>();

  constructor(
    private readonly bus: ClusterBus,
    private readonly local: LocalBleWork,
    private readonly logger: () => LoggerService,
  ) {
    bus.handle(BleClusterMessage.STATUS, (payload) => local.readerStatus((payload as { readerId: number }).readerId));
    bus.handle(BleClusterMessage.SCAN, (payload, from) => this.scan(payload as ScanRequest & { opId: string }, from));
    bus.handle(BleClusterMessage.CONNECT, (payload, from) =>
      this.connect(payload as ConnectRequest & { opId: string; linkId: string }, from),
    );
    bus.handle(BleClusterMessage.LINK, (payload, from) => this.linkCall(payload as LinkCall, from));
    bus.on(BleClusterMessage.CANCEL, (payload, from) => {
      this.ops.get(key(from, (payload as { opId: string }).opId))?.controller.abort();
    });
  }

  /** The origins this instance serves links or operations for. */
  origins(): Set<string> {
    return new Set([...this.links.values(), ...this.ops.values()].map((entry) => entry.origin));
  }

  get linkCount(): number {
    return this.links.size;
  }

  /** The origin is gone: its links close on the reader and its running operations stop. */
  dropOrigin(origin: string): void {
    for (const [id, served] of this.links) {
      if (served.origin !== origin) continue;
      this.links.delete(id);
      this.logger().log(`ble closing link of gone instance origin=${origin} link=${served.linkId}`);
      void served.link.disconnect().catch(() => undefined);
    }
    for (const op of this.ops.values()) if (op.origin === origin) op.controller.abort();
  }

  private async withOp<T>(origin: string, opId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.ops.set(key(origin, opId), { origin, controller });
    try {
      return await work(controller.signal);
    } finally {
      this.ops.delete(key(origin, opId));
    }
  }

  private scan(request: ScanRequest & { opId: string }, origin: string): Promise<WireAdvertisement[]> {
    return this.withOp(origin, request.opId, async (signal) => {
      const { readerId, filter, durationMs, context } = request;
      const found = await this.local.scan({ readerId, filter, durationMs, context, signal });
      return found.map(encodeAdvertisement);
    });
  }

  private connect(
    request: ConnectRequest & { opId: string; linkId: string },
    origin: string,
  ): Promise<{ mtu?: number }> {
    return this.withOp(origin, request.opId, async (signal) => {
      const { readerId, address, addressType, timeoutMs, sessionId, leaseMs, allowlist, context, linkId } = request;
      const link = await this.local.connect({
        readerId,
        address,
        addressType,
        timeoutMs,
        signal,
        sessionId,
        leaseMs,
        allowlist,
        context,
      });
      if (signal.aborted) {
        // The origin gave up while the reader connected: nobody will use this link.
        void link.disconnect().catch(() => undefined);
        throw cancelledError('connect');
      }
      const id = key(origin, linkId);
      const served: ServedLink = { origin, linkId, link };
      this.links.set(id, served);
      link.onDisconnected((detail) => {
        if (this.links.get(id) !== served) return;
        this.links.delete(id);
        void this.bus.send(origin, BleClusterMessage.LINK_LOST, { linkId, detail });
      });
      // A link lost before the answer would leave the origin with a link nobody serves.
      if (this.links.get(id) !== served) throw readerLinkLost('connect');
      return { mtu: link.mtu };
    });
  }

  private async linkCall(call: LinkCall, origin: string): Promise<unknown> {
    const id = key(origin, call.linkId);
    const served = this.links.get(id);
    if (call.op === 'disconnect') {
      if (!served) return null;
      this.links.delete(id);
      await served.link.disconnect();
      return null;
    }
    if (!served) throw readerLinkLost(call.op);
    const { link } = served;
    const ref = { serviceUuid: call.serviceUuid, characteristicUuid: call.characteristicUuid };
    return this.withOp(origin, call.opId, async (signal) => {
      switch (call.op) {
        case 'read':
          return encodeBytes(await link.read({ ...ref, signal, timeoutMs: call.timeoutMs }));
        case 'write':
          await link.write({
            ...ref,
            value: decodeBytes(call.value),
            withoutResponse: call.withoutResponse === true,
            signal,
            timeoutMs: call.timeoutMs,
          });
          return null;
        case 'subscribe': {
          const { linkId, subscriptionId } = call;
          await link.subscribe({
            ...ref,
            indicate: call.indicate === true,
            signal,
            timeoutMs: call.timeoutMs,
            onNotification: (value) =>
              void this.bus.send(origin, BleClusterMessage.NOTIFY, {
                linkId,
                subscriptionId,
                value: encodeBytes(value),
              }),
            onError: (error) =>
              void this.bus.send(origin, BleClusterMessage.NOTIFY_ERROR, {
                linkId,
                subscriptionId,
                error: serializeClusterError(error),
              }),
          });
          return null;
        }
        case 'unsubscribe':
          await link.unsubscribe({ ...ref, timeoutMs: call.timeoutMs });
          return null;
        default:
          throw readerLinkLost(String(call.op));
      }
    });
  }
}
