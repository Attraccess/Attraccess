import { Inject, Injectable, Logger } from '@nestjs/common';
import { closeSync } from 'fs';
import { randomBytes } from 'crypto';
import { WebSocket } from 'ws';
import { SettingsService } from '../../settings/settings.service';
import { AttractapFirmware } from '../dtos/firmware.dto';
import { AttractapFirmwareHandler } from './handlers/firmware/firmware.handler';
import { readerHeartbeat, readerServerTime } from './websocket-reader-payloads';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

/** Old firmware cannot pair, so this many token readers may update at the same time; more are closed. */
export const MAX_LEGACY_CONNECTIONS = 50;
/**
 * A slot is held only by downloading: a connection must be offered an update within this time, and after the offer
 * it must request the next chunk within this time (old firmware pauses its heartbeats during the update). Heartbeats
 * and other messages never extend it, so a client without credentials cannot hold a slot by idling.
 */
export const LEGACY_IDLE_TIMEOUT_MS = 60_000;
/** Every legacy connection ends after this long, downloading or not; a reader that was not done reconnects. */
export const LEGACY_MAX_CONNECTION_MS = 20 * 60_000;
/** Repeated warnings about the same firmware without an update are logged at most this often. */
const NO_UPDATE_WARNING_INTERVAL_MS = 10 * 60_000;

/** The shown name of the reader while it updates. Old firmware shows it on its main screen. */
const UPDATE_DEVICE_NAME = 'Firmware update';

/** Messages of the removed token protocol; they exist only on this connection. */
const LEGACY = {
  requestAuthentication: 'READER_REQUEST_AUTHENTICATION',
  register: 'READER_REGISTER',
  authenticate: 'READER_AUTHENTICATE',
} as const;

interface LegacyMessage {
  event?: unknown;
  data?: { type?: unknown; payload?: unknown };
}

/**
 * Readers with firmware older than 2.6.0 sign in with a token. Token sign-in is gone and old firmware cannot pair,
 * so without this they could only be updated over USB. This keeps one door open for them: a connection without a
 * subprotocol may only update its firmware.
 *
 * It speaks just enough of the old protocol for that: it asks the reader to sign in, accepts any token (there are no
 * reader records any more to check one against, see the pairing docs), offers the latest image for the reported
 * firmware and variant, and serves the chunks. Nothing else is handled: no reader record, no resources, no cards. The
 * images are the ones the web flasher already serves without sign-in, so an impostor gains nothing. After the update
 * the reader runs firmware without a token and pairs like a new reader.
 *
 * Nothing the reader sends is logged: the sign-in carries its token.
 */
@Injectable()
export class LegacyFirmwareUpdateService {
  private readonly logger = new Logger('AttractapLegacyUpdate');
  private readonly connections = new Set<WebSocket>();
  private readonly noUpdateWarnedAt = new Map<string, number>();

  @Inject(AttractapFirmwareHandler)
  private firmwareHandler: AttractapFirmwareHandler;

  @Inject(SettingsService)
  private settingsService: SettingsService;

  public get connectionCount(): number {
    return this.connections.size;
  }

  /** Takes over a connection without a subprotocol. `licensed` rejects on installations without the module. */
  public handleConnection(client: WebSocket, licensed: Promise<void>): void {
    if (this.connections.size >= MAX_LEGACY_CONNECTIONS) {
      this.logger.warn(`Closing an old reader's connection: ${MAX_LEGACY_CONNECTIONS} are already updating`);
      client.close();
      return;
    }
    this.connections.add(client);

    const socket = this.updateSocket(client);
    const lifetime = setTimeout(() => client.close(), LEGACY_MAX_CONNECTION_MS);
    lifetime.unref?.();
    let idleTimer: NodeJS.Timeout | null = null;
    // Re-armed only when the update moves on: the offer, then each chunk request.
    const progressed = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => client.close(), LEGACY_IDLE_TIMEOUT_MS);
      idleTimer.unref?.();
    };
    progressed();

    client.on('close', () => {
      clearTimeout(lifetime);
      if (idleTimer) clearTimeout(idleTimer);
      this.connections.delete(client);
      if (socket.state.ota?.fd) {
        try {
          closeSync(socket.state.ota.fd);
        } catch {
          // already closed
        }
      }
    });

    // Messages that arrive before the license check finished wait for it, in order.
    let queue = licensed.then(
      () => {
        this.sendEvent(client, LEGACY.requestAuthentication, {});
        return true;
      },
      () => {
        this.logger.error("Closing an old reader's connection due to license error");
        client.close();
        return false;
      },
    );
    client.on('message', (raw: Buffer | string, isBinary?: boolean) => {
      if (isBinary) return;
      queue = queue.then(async (admitted) => {
        if (!admitted || client.readyState !== WebSocket.OPEN) return admitted;
        try {
          await this.onMessage(client, socket, String(raw), progressed);
        } catch (error) {
          this.logger.error(`Old reader update failed: ${(error as Error).message}`);
        }
        return admitted;
      });
    });
  }

  private async onMessage(
    client: WebSocket,
    socket: AuthenticatedWebSocket,
    raw: string,
    progressed: () => void,
  ): Promise<void> {
    let message: LegacyMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message?.event === 'HEARTBEAT') {
      client.send(readerHeartbeat(readerServerTime()));
      return;
    }
    if (message?.event !== 'EVENT') return;
    const type = message.data?.type;
    const payload = (message.data?.payload ?? {}) as Record<string, unknown>;

    switch (type) {
      case LEGACY.register:
        // Firmware before 1.8.0 without a token registers first; it stores what it gets and signs in with it.
        this.sendEvent(client, LEGACY.register, { id: 0, token: randomBytes(16).toString('hex') });
        return;
      case LEGACY.authenticate:
        this.sendEvent(client, AttractapEventType.READER_AUTHENTICATED, {
          name: UPDATE_DEVICE_NAME,
          language: (await this.settingsService.getDefaultLanguage()) ?? 'en',
          serverTime: readerServerTime(),
        });
        return;
      case AttractapEventType.READER_FIRMWARE_INFO:
        if (await this.offerUpdate(client, socket, payload)) progressed();
        return;
      case AttractapEventType.FIRMWARE_REQUEST_CHUNK:
        if (!socket.state.ota) return;
        progressed();
        return this.firmwareHandler.handleFirmwareChunkRequest(socket, { type, payload } as AttractapEvent['data']);
      default:
        // ACKs, crash reports, card taps: nothing else is handled on this connection.
        return;
    }
  }

  private async offerUpdate(
    client: WebSocket,
    socket: AuthenticatedWebSocket,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const current = {
      name: String(payload.name ?? ''),
      variant: String(payload.variant ?? ''),
      version: String(payload.version ?? ''),
    } as AttractapFirmware;
    if (socket.state.ota) return false; // one update per connection
    if (await this.firmwareHandler.offerLegacyUpdate(socket, current)) {
      this.logger.log(
        `Updating an old reader with token sign-in (${current.name}/${current.variant} ${current.version}); ` +
          'it pairs once the update is done',
      );
      return true;
    }
    this.warnNoUpdate(current);
    client.close();
    return false;
  }

  private warnNoUpdate(current: AttractapFirmware): void {
    const firmware = `${current.name}/${current.variant} ${current.version}`.slice(0, 120);
    const now = Date.now();
    const last = this.noUpdateWarnedAt.get(firmware);
    if (last !== undefined && now - last < NO_UPDATE_WARNING_INTERVAL_MS) return;
    if (this.noUpdateWarnedAt.size > 100) this.noUpdateWarnedAt.clear();
    this.noUpdateWarnedAt.set(firmware, now);
    this.logger.warn(
      `An old reader with token sign-in reported ${firmware}, but this server has no newer image for it; ` +
        'flash it over USB with the web flasher',
    );
  }

  /** The parts of a reader socket the firmware handler uses for the update. */
  private updateSocket(client: WebSocket): AuthenticatedWebSocket {
    const id = randomBytes(4).toString('base64url').slice(0, 5);
    return {
      id,
      readerId: null,
      state: { ota: null },
      sendMessage: async (message: AttractapEvent) => {
        this.sendEvent(client, message.data.type, message.data.payload);
        return true;
      },
      sendBinaryData: (data: Buffer) => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      },
    } as unknown as AuthenticatedWebSocket;
  }

  /** Sent once: old firmware acknowledges every event, but nothing here depends on the acknowledgement. */
  private sendEvent(client: WebSocket, type: string, payload: unknown): void {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
  }
}
