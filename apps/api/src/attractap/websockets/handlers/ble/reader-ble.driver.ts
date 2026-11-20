import { PluginBleError, type PluginBleAdvertisement } from '@attraccess/plugins-backend-sdk';
import type { BleSessionClock } from '@attraccess/plugins-backend-sdk/internal';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { WebSocket } from 'ws';
import type { PluginBleMetrics } from '../../../../metrics/definitions/plugin-ble.metrics';
import { PLUGIN_BLE_METRICS } from '../../../../metrics/definitions/tokens';
import type {
  BleDriverLink,
  BleReaderStatus,
  BleTransportDriver,
} from '../../../../plugin-system/ble/ble-transport-driver';
import { WebsocketService } from '../../websocket.service';
import { AttractapEventType, type AttractapEvent, type AuthenticatedWebSocket } from '../../websocket.types';
import { BLE_PROTOCOL_VERSION, loggableInt } from './ble-wire';
import { ReaderBleChannel } from './reader-ble-channel';
import { ReaderBleWatch } from './reader-ble-watch';

const realClock: BleSessionClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    return () => clearTimeout(timer);
  },
};

/**
 * Plugin BLE through Attractap readers (ATT-1033/ATT-1036): the `BleTransportDriver` over the reader websocket,
 * protocol v1 (see `ble-wire.ts`). One BLE owner (scan or session) per reader connection; conflicts are refused
 * with `READER_BUSY`, never queued. Everything is bound to the socket instance it started on. The advertisement
 * watch (`reader-ble-watch.ts`) is no owner: it runs beside scans and sessions.
 */
@Injectable()
export class ReaderBleDriver implements BleTransportDriver {
  private readonly logger = new Logger('ReaderBleDriver');
  private readonly channels = new WeakMap<AuthenticatedWebSocket, ReaderBleChannel>();
  /** Overridable for tests. */
  public clock: BleSessionClock = realClock;
  private readonly watch = new ReaderBleWatch({
    clock: () => this.clock,
    logger: () => this.logger,
    metrics: () => this.metrics,
    readerStatus: (readerId) => this.readerStatus(readerId),
    currentSocket: (readerId) => this.currentSocket(readerId),
  });

  constructor(
    private readonly websocketService: WebsocketService,
    @Optional() @Inject(PLUGIN_BLE_METRICS) private readonly metrics?: PluginBleMetrics,
  ) {}

  readerStatus(readerId: number): BleReaderStatus {
    const socket = this.currentSocket(readerId);
    if (!socket) return { status: 'offline' };
    const ble = socket.state.ble;
    if (!ble) return { status: 'offline', detail: 'firmware-info-pending' };
    if ('detail' in ble) return { status: 'unsupported', detail: ble.detail };
    return { status: 'available' };
  }

  scan(request: Parameters<BleTransportDriver['scan']>[0]): Promise<PluginBleAdvertisement[]> {
    return this.channelFor(request.readerId, 'scan').scan(request);
  }

  connect(request: Parameters<BleTransportDriver['connect']>[0]): Promise<BleDriverLink> {
    return this.channelFor(request.readerId, 'connect').connect(request);
  }

  setWatch(request: Parameters<NonNullable<BleTransportDriver['setWatch']>>[0]): void {
    this.watch.set(request);
  }

  /** Inbound BLE_* message of a reader. Unknown versions, sessions and requests are dropped and logged. */
  handleMessage(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']): void {
    const payload = eventData.payload as Record<string, unknown> | undefined;
    if (typeof payload !== 'object' || payload === null) return;
    const version = payload.v;
    if (version !== BLE_PROTOCOL_VERSION) {
      this.logger.warn(
        `ble ignored message type=${eventData.type} reader=${socket.readerId} v=${loggableInt(version)}: unsupported protocol version`,
      );
      return;
    }
    if (eventData.type === AttractapEventType.BLE_WATCH_STATE) return this.watch.handleState(socket, payload);
    if (eventData.type === AttractapEventType.BLE_WATCH_EVENT) return this.watch.handleEvents(socket, payload);
    const channel = this.channels.get(socket);
    if (!channel) {
      this.logger.debug(
        `ble dropped message type=${eventData.type} reader=${socket.readerId} client=${socket.id}: no BLE work on this connection`,
      );
      return;
    }
    switch (eventData.type) {
      case AttractapEventType.BLE_RESULT:
      case AttractapEventType.BLE_SCAN_RESULT:
        return channel.handleResult(payload);
      case AttractapEventType.BLE_NOTIFICATION:
        return channel.handleNotification(payload);
      case AttractapEventType.BLE_SESSION_ENDED:
        return channel.handleSessionEnded(payload);
    }
  }

  /**
   * The socket closed, or the identity on it changed: its sessions close with `disconnected`, its pending calls
   * fail with DISCONNECTED `reader-link-lost`. Other sockets of the same reader are not touched.
   */
  socketClosed(socket: AuthenticatedWebSocket): void {
    this.watch.socketClosed(socket);
    const channel = this.channels.get(socket);
    if (!channel) return;
    this.channels.delete(socket);
    if (channel.busy || channel.pendingCount > 0) {
      this.logger.log(`ble reader link lost reader=${channel.readerId} client=${socket.id}: releasing BLE work`);
    }
    channel.close();
  }

  /**
   * The reader announced itself (READER_FIRMWARE_INFO) on `socket`. A reader holds one connection and ends its BLE
   * session whenever it loses it, so BLE work on any older connection of the same reader is gone, even when that
   * socket did not close yet (a half-open TCP connection after a reset closes only on the heartbeat timeout).
   */
  readerConnected(socket: AuthenticatedWebSocket): void {
    if (socket.readerId === null) return;
    for (const other of this.websocketService.sockets.values()) {
      if (other !== socket && other.readerId === socket.readerId && this.channels.has(other)) this.socketClosed(other);
    }
  }

  /**
   * READER_FIRMWARE_INFO was applied on `socket` (`capabilities.ble` is known): the advertisement watch set of the
   * reader goes to this connection, or the reader is reported `unsupported` when its firmware cannot watch.
   */
  readerAnnounced(socket: AuthenticatedWebSocket): void {
    this.watch.readerAnnounced(socket);
  }

  /** The newest open connection of the reader: a stale one that did not close yet is never used for new work. */
  private currentSocket(readerId: number): AuthenticatedWebSocket | undefined {
    let current: AuthenticatedWebSocket | undefined;
    for (const socket of this.websocketService.sockets.values()) {
      if (socket.readerId === readerId && socket.state && socket.readyState === WebSocket.OPEN) current = socket;
    }
    return current;
  }

  private channelFor(readerId: number, operation: string): ReaderBleChannel {
    const status = this.readerStatus(readerId);
    if (status.status === 'unsupported') {
      throw new PluginBleError('READER_UNSUPPORTED', 'The reader firmware cannot do plugin BLE', {
        operation,
        detail: status.detail,
      });
    }
    const socket = status.status === 'available' ? this.currentSocket(readerId) : undefined;
    if (!socket) {
      throw new PluginBleError('READER_OFFLINE', `Reader ${readerId} is not connected`, {
        operation,
        detail: status.status === 'offline' ? status.detail : undefined,
      });
    }
    let channel = this.channels.get(socket);
    if (!channel || channel.isClosed) {
      channel = new ReaderBleChannel(socket, readerId, {
        clock: this.clock,
        logger: this.logger,
        metrics: this.metrics,
        capability: () => {
          const ble = socket.state.ble;
          return ble && 'capability' in ble ? ble.capability : null;
        },
        // Chunks are being served: the reader is writing a firmware update.
        otaInProgress: () => socket.state.ota?.fd !== undefined,
      });
      this.channels.set(socket, channel);
    }
    return channel;
  }
}
