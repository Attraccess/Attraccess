import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, Server } from 'http';
import type { DeviceEvent, MessageMatcher, ServerEvent } from './types.js';

export interface MockWsServerOptions {
  port?: number;
  /** Called each time the device sends an EVENT (not HEARTBEAT) */
  onEvent?: (type: string, payload: Record<string, unknown> | undefined) => void;
}

/**
 * Lightweight mock Attraccess WebSocket backend.
 *
 * Usage:
 *   const srv = new MockWsServer({ port: 9001 });
 *   await srv.start();
 *   // ... tests ...
 *   await srv.stop();
 */
export class MockWsServer {
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private socket: WebSocket | null = null;
  private messageQueue: DeviceEvent[] = [];
  private matchers: MessageMatcher[] = [];
  readonly port: number;
  private onEvent?: (type: string, payload: Record<string, unknown> | undefined) => void;

  // Raw binary handlers for OTA chunks
  private binaryHandlers: Array<(data: Buffer) => void> = [];

  constructor(options: MockWsServerOptions = {}) {
    this.port = options.port ?? 9001;
    this.onEvent = options.onEvent;
  }

  async start(): Promise<void> {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      // Only one device at a time in HIL testing.
      if (this.socket) {
        this.socket.terminate();
      }
      this.socket = ws;
      this.messageQueue = [];
      this.matchers = [];
      this.binaryHandlers = [];

      ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (isBinary) {
          const buf = Buffer.isBuffer(raw) ? (raw as Buffer) : Buffer.from(raw as ArrayBuffer);
          for (const h of this.binaryHandlers) {
            h(buf);
          }
          return;
        }

        let event: DeviceEvent;
        try {
          event = JSON.parse(raw.toString()) as DeviceEvent;
        } catch {
          return;
        }

        if (event.event === 'HEARTBEAT') {
          return;
        }

        // ACK_* messages can be ignored at the mock level
        if (event.data?.type?.startsWith('ACK_')) {
          return;
        }

        const type = event.data?.type ?? '';
        const payload = event.data?.payload;

        this.onEvent?.(type, payload);

        // Try to satisfy a waiting matcher
        const idx = this.matchers.findIndex((m) => m.type === type);
        if (idx !== -1) {
          const [matcher] = this.matchers.splice(idx, 1);
          clearTimeout(matcher.timer);
          matcher.resolve(payload);
          return;
        }

        this.messageQueue.push(event);
      });

      ws.on('close', () => {
        if (this.socket === ws) {
          this.socket = null;
        }
      });
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.port, '0.0.0.0', resolve);
    });
  }

  async stop(): Promise<void> {
    this.socket?.terminate();
    this.socket = null;

    await new Promise<void>((resolve, reject) => {
      this.wss?.close((err?: Error) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((err?: Error) => (err ? reject(err) : resolve()));
    });
    this.wss = null;
    this.httpServer = null;
  }

  /**
   * Wait until the device sends an event of the given type.
   * Returns the event's payload. Fails after `timeout` ms.
   */
  waitForMessage(type: string, timeout = 30_000): Promise<Record<string, unknown> | undefined> {
    // Check the already-received queue first
    const idx = this.messageQueue.findIndex((e) => e.data?.type === type);
    if (idx !== -1) {
      const [event] = this.messageQueue.splice(idx, 1);
      return Promise.resolve(event.data?.payload);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.matchers.findIndex((m) => m.resolve === resolve);
        if (i !== -1) this.matchers.splice(i, 1);
        reject(new Error(`Timeout waiting for WS message type "${type}" after ${timeout}ms`));
      }, timeout);

      this.matchers.push({ type, resolve, reject, timer });
    });
  }

  /** Send an event toward the device. */
  send(type: string, payload?: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`MockWsServer: no connected device when trying to send "${type}"`);
    }
    const event: ServerEvent = { event: 'EVENT', data: { type, payload } };
    this.socket.send(JSON.stringify(event));
  }

  /** Send a raw binary frame (used to deliver OTA firmware chunks). */
  sendBinary(data: Buffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('MockWsServer: no connected device when trying to send binary frame');
    }
    this.socket.send(data, { binary: true });
  }

  /**
   * Register a one-shot binary-frame handler (for OTA chunk delivery).
   * The handler is called for every binary frame until removed.
   */
  onBinary(handler: (data: Buffer) => void): () => void {
    this.binaryHandlers.push(handler);
    return () => {
      const i = this.binaryHandlers.indexOf(handler);
      if (i !== -1) this.binaryHandlers.splice(i, 1);
    };
  }

  /** True when a device is currently connected. */
  get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Wait until a device connects (or rejects after timeout).
   * If `requireNew` is true, waits for a fresh connection event even if one
   * is already active (useful after a device reboot to avoid returning the
   * stale pre-reboot connection).
   */
  waitForConnection(timeout = 30_000, requireNew = false): Promise<void> {
    if (!requireNew && this.isConnected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        this.wss?.off('connection', onConn);
        reject(new Error(`Timeout waiting for device WS connection after ${timeout}ms`));
      }, timeout);

      const onConn = () => {
        clearTimeout(deadline);
        this.wss?.off('connection', onConn);
        resolve();
      };

      this.wss?.once('connection', onConn);
    });
  }

  /** Drain the unmatched message queue (useful between test sections). */
  drainQueue(): void {
    this.messageQueue = [];
  }
}
