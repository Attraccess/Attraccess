import { PLUGIN_BLE_LIMITS, type PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import type { LoggerService } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ClusterService } from '../../../../cluster/cluster.service';
import type { SerializedClusterError } from '../../../../cluster/cluster-errors';
import type {
  BleDriverLink,
  BleReaderStatus,
  BleTransportDriver,
} from '../../../../plugin-system/ble/ble-transport-driver';
import {
  BLE_CLUSTER_CHECK_EVERY_MS,
  BLE_CLUSTER_GRACE_MS,
  BLE_CLUSTER_STATUS_TIMEOUT_MS,
  BleClusterMessage,
  callHolder,
  decodeAdvertisement,
  READER_LINK_LOST,
  type WireAdvertisement,
} from './ble-cluster-wire';
import { ClusterBleWatchMerger } from './cluster-ble-watch-merger';
import { ClusterBleWatchOrigin } from './cluster-ble-watch';
import { RemoteBleLink } from './remote-ble-link';
import { ServedBleWork, type LocalBleWork } from './served-ble-work';

type ScanRequest = Parameters<BleTransportDriver['scan']>[0];
type ConnectRequest = Parameters<BleTransportDriver['connect']>[0];
type WatchRequest = Parameters<NonNullable<BleTransportDriver['setWatch']>>[0];

/** The reader driver's own paths, for the readers whose websocket this instance holds. */
export interface ClusterBleLocal extends LocalBleWork {
  setWatch(request: WatchRequest): void;
  hasSocket(readerId: number): boolean;
  /** The reader signed in on another instance: BLE work on this instance's (stale) connections of it is gone. */
  releaseReader(readerId: number): void;
}

/** Link losses that arrived before the connect answer they belong to (both can come in one read from Valkey). */
const EARLY_LOSSES_KEPT = 64;
/** The holder's close waits for the reader up to 5 s. */
const LATE_DISCONNECT_TIMEOUT_MS = 5_000 + BLE_CLUSTER_GRACE_MS;

/**
 * Plugin BLE across API instances (ATT-1163), active only with Valkey. Every call goes to the instance holding the
 * reader's newest websocket: in process when that is this instance (the driver's local path, unchanged), over the
 * cluster bus otherwise. This instance serves the same calls for the others, and a periodic check ends links and
 * watch parts whose instance on the other end is gone.
 */
export class ClusterBleRouter {
  private readonly links = new Map<string, RemoteBleLink>();
  private readonly earlyLosses = new Map<string, string | undefined>();
  private readonly served: ServedBleWork;
  private readonly merger: ClusterBleWatchMerger;
  private readonly watches: ClusterBleWatchOrigin;
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(
    private readonly cluster: ClusterService,
    private readonly local: ClusterBleLocal,
    private readonly logger: () => LoggerService,
    checkEveryMs = BLE_CLUSTER_CHECK_EVERY_MS,
  ) {
    const bus = cluster.bus;
    this.served = new ServedBleWork(bus, local, logger);
    this.merger = new ClusterBleWatchMerger(bus, (request) => local.setWatch(request));
    this.watches = new ClusterBleWatchOrigin(bus, (readerId) => this.holderOf(readerId));
    bus.on(BleClusterMessage.NOTIFY, (payload, from) => {
      const { linkId, subscriptionId, value } = payload as { linkId: string; subscriptionId: number; value: string };
      this.linkOf(linkId, from)?.handleNotification(subscriptionId, value);
    });
    bus.on(BleClusterMessage.NOTIFY_ERROR, (payload, from) => {
      const { linkId, subscriptionId, error } = payload as {
        linkId: string;
        subscriptionId: number;
        error: SerializedClusterError;
      };
      this.linkOf(linkId, from)?.handleNotificationError(subscriptionId, error);
    });
    bus.on(BleClusterMessage.LINK_LOST, (payload, from) => {
      const { linkId, detail } = payload as { linkId: string; detail?: string };
      const link = this.linkOf(linkId, from);
      if (link) return link.lost(detail ?? READER_LINK_LOST);
      this.earlyLosses.set(linkId, detail);
      if (this.earlyLosses.size > EARLY_LOSSES_KEPT)
        this.earlyLosses.delete(this.earlyLosses.keys().next().value as string);
    });
    cluster.presence.onReaderConnected((readerId, instanceId) => this.readerConnected(readerId, instanceId));
    this.timer = setInterval(() => void this.check(), checkEveryMs);
    this.timer.unref?.();
  }

  get instanceId(): string {
    return this.cluster.instanceId;
  }

  /** Links this instance uses on other instances, and links it serves for them (diagnostics and tests). */
  get counts(): { remote: number; served: number } {
    return { remote: this.links.size, served: this.served.linkCount };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** The instance holding the reader's newest connection; this one when Valkey cannot tell but it holds a socket. */
  async holderOf(readerId: number): Promise<string | null> {
    try {
      return (await this.cluster.presence.holders(readerId))[0]?.instanceId ?? null;
    } catch {
      return this.local.hasSocket(readerId) ? this.instanceId : null;
    }
  }

  private isLocal(holder: string | null): boolean {
    return holder === null || holder === this.instanceId;
  }

  async readerStatus(readerId: number): Promise<BleReaderStatus> {
    const holder = await this.holderOf(readerId);
    if (this.isLocal(holder)) return this.local.readerStatus(readerId);
    try {
      return await this.cluster.bus.request<BleReaderStatus>(
        holder as string,
        BleClusterMessage.STATUS,
        { readerId },
        BLE_CLUSTER_STATUS_TIMEOUT_MS,
      );
    } catch {
      return { status: 'offline', detail: 'reader-unreachable' };
    }
  }

  async scan(request: ScanRequest): Promise<PluginBleAdvertisement[]> {
    const holder = await this.holderOf(request.readerId);
    // Nobody holds the reader: the local path answers READER_OFFLINE, as on a single instance.
    if (this.isLocal(holder)) return this.local.scan(request);
    const { signal, ...payload } = request;
    const found = await callHolder<WireAdvertisement[]>(this.cluster.bus, {
      holder: holder as string,
      type: BleClusterMessage.SCAN,
      payload,
      operation: 'scan',
      timeoutMs: request.durationMs + 2 * BLE_CLUSTER_GRACE_MS,
      signal,
    });
    return found.map(decodeAdvertisement);
  }

  async connect(request: ConnectRequest): Promise<BleDriverLink> {
    const holder = await this.holderOf(request.readerId);
    if (this.isLocal(holder)) return this.local.connect(request);
    const bus = this.cluster.bus;
    const linkId = randomUUID();
    const { signal, ...payload } = request;
    const answer = await callHolder<{ mtu?: number }>(bus, {
      holder: holder as string,
      type: BleClusterMessage.CONNECT,
      payload: { ...payload, linkId },
      operation: 'connect',
      timeoutMs: request.timeoutMs + BLE_CLUSTER_GRACE_MS,
      signal,
      // Connected after this instance gave up (the cancel came too late): nobody will use the link.
      onLate: () =>
        void callHolder(bus, {
          holder: holder as string,
          type: BleClusterMessage.LINK,
          payload: { linkId, op: 'disconnect' },
          operation: 'disconnect',
          timeoutMs: LATE_DISCONNECT_TIMEOUT_MS,
        }).catch(() => undefined),
    });
    const link = new RemoteBleLink(
      bus,
      holder as string,
      linkId,
      request.readerId,
      answer.mtu ?? PLUGIN_BLE_LIMITS.mtuMin,
      (finished) => {
        if (this.links.get(finished.linkId) === finished) this.links.delete(finished.linkId);
      },
    );
    this.links.set(linkId, link);
    if (this.earlyLosses.has(linkId)) {
      const detail = this.earlyLosses.get(linkId);
      this.earlyLosses.delete(linkId);
      link.lost(detail ?? READER_LINK_LOST);
    }
    return link;
  }

  setWatch(request: WatchRequest): void {
    this.watches.set(request);
  }

  private linkOf(linkId: string, from: string): RemoteBleLink | undefined {
    const link = this.links.get(linkId);
    return link?.holder === from ? link : undefined;
  }

  private readerConnected(readerId: number, instanceId: string): void {
    if (instanceId !== this.instanceId) this.local.releaseReader(readerId);
    // A session ends whenever the reader drops its connection; its new holder never had it.
    for (const link of [...this.links.values()]) {
      if (link.readerId === readerId && link.holder !== instanceId) link.lost(READER_LINK_LOST);
    }
    this.watches.readerConnected(readerId, instanceId);
  }

  /** Ends what depends on an instance whose heartbeat lapsed, on both ends (the cluster's `onGone` runs elsewhere). */
  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const peers = new Set([
        ...[...this.links.values()].map((link) => link.holder),
        ...this.watches.holders(),
        ...this.served.origins(),
        ...this.merger.origins(),
      ]);
      peers.delete(this.instanceId);
      for (const peer of peers) {
        // Valkey unreachable: nobody can be judged gone now.
        if (await this.cluster.instances.isAlive(peer).catch(() => true)) continue;
        this.logger().log(`ble instance gone instance=${peer}: ending its plugin BLE links and watch parts`);
        for (const link of [...this.links.values()]) if (link.holder === peer) link.lost(READER_LINK_LOST);
        this.watches.holderGone(peer);
        this.served.dropOrigin(peer);
        this.merger.dropOrigin(peer);
      }
    } finally {
      this.checking = false;
    }
  }
}
