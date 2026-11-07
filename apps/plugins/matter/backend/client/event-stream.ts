import {
  CLOSE_CODES,
  DEFAULT_REPLAY_MAX_EVENTS,
  EVENTS_PATH,
  MAX_MESSAGE_BYTES,
  WIRE_VERSION,
  parseCursor,
  serverMessageSchema,
  type EventEnvelope,
  type ServerMessage,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  SidecarClientError,
  classifyHttpFailure,
  classifyNetworkError,
  closedUnexpectedly,
  fromErrorEnvelope,
  protocolError,
  streamSilent,
} from './errors';
import type { SidecarHttpClient } from './rest-client';
import { eventsUrl, parseEndpoint } from './url';

export const PING_INTERVAL_MS = 30_000;
/** Twice the sidecar's replay default, so a replay that overlaps live events cannot push an ID out too early. */
export const SEEN_EVENT_IDS = DEFAULT_REPLAY_MAX_EVENTS * 2;
const HANDSHAKE_TIMEOUT_MS = 10_000;

export type ReconciliationReason = 'expired' | 'evicted' | 'future' | 'foreign-stream' | 'malformed' | 'sequence-gap';

export type StreamEvent = { cursor: string; event: EventEnvelope };

export type StreamClose = {
  code: number;
  /** Why the connection ended, as a typed error (an unreachable sidecar, a rejected token, a bad release, ...). */
  error: SidecarClientError | null;
  /** True when the consumer must reconcile and the next connection starts fresh, without a cursor. */
  reconcile: boolean;
};

export type StreamHandlers = {
  onHello(): void;
  onEvent(event: StreamEvent): void;
  onReconciliationRequired(reason: ReconciliationReason): void;
  onClose(close: StreamClose): void;
};

/** Bounded, insertion-ordered set of event IDs; the oldest ID is forgotten first. */
export class SeenEventIds {
  private readonly ids = new Set<string>();
  constructor(private readonly capacity = SEEN_EVENT_IDS) {}

  /** Returns false when the ID was already seen. */
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.capacity) this.ids.delete(this.ids.values().next().value as string);
    return true;
  }

  clear(): void {
    this.ids.clear();
  }

  get size(): number {
    return this.ids.size;
  }
}

/** One connection attempt: its socket, the handlers it reports to, and how it reports its end exactly once. */
type Link = { socket: WebSocket; handlers: StreamHandlers; finish: (close: StreamClose) => void };

/**
 * Resumable subscriber for `/v1/events`. It keeps the last cursor and the seen event IDs across reconnects, so a new
 * connection resumes without losing or repeating events. Reconnect scheduling belongs to the caller.
 */
export class SidecarEventStream {
  private socket: WebSocket | null = null;
  private lastCursor: string | null = null;
  private readonly seen = new SeenEventIds();
  private streamInstanceId: string | null = null;
  /** Sequence the next event must have, once known. Per stream instance: a new instance never counts as a gap. */
  private expectedSequence: number | null = null;
  private pingTimer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;

  constructor(
    private readonly client: () => SidecarHttpClient,
    private readonly handlers: StreamHandlers,
    private readonly pingIntervalMs = PING_INTERVAL_MS,
  ) {}

  get cursor(): string | null {
    return this.lastCursor;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Drops the cursor and the seen IDs. The next connection is a fresh start. */
  reset(): void {
    this.lastCursor = null;
    this.expectedSequence = null;
    this.streamInstanceId = null;
    this.seen.clear();
  }

  /**
   * Opens a new connection that resumes from the last cursor. `handlers` hears only about this connection, so a
   * caller can tell one connection attempt from the next.
   */
  connect(url: string, handlers: StreamHandlers = this.handlers): void {
    this.disconnect();
    const correlationId = randomUUID();
    const client = this.client();
    const socket = new WebSocket(eventsUrl(parseEndpoint(url), EVENTS_PATH), {
      headers: client.headers(correlationId, HANDSHAKE_TIMEOUT_MS),
      ...client.tlsOptions,
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      maxPayload: MAX_MESSAGE_BYTES,
      followRedirects: false,
    });
    this.socket = socket;
    let opened = false;
    let finished = false;
    const link: Link = {
      socket,
      handlers,
      finish: (close) => {
        if (finished || this.socket !== socket) return;
        finished = true;
        this.stopPing();
        this.socket = null;
        handlers.onClose(close);
      },
    };
    socket.on('open', () => {
      opened = true;
      this.watch(link);
    });
    socket.on('message', (data, isBinary) => {
      this.watchdog?.refresh();
      if (isBinary) return this.protocolError(link);
      const parsed = serverMessageSchema.safeParse(safeJson(String(data)));
      if (!parsed.success) return this.protocolError(link);
      this.handle(link, parsed.data);
    });
    socket.on('unexpected-response', (_request, response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.length < 64 && chunks.push(chunk));
      response.on('end', () => {
        const header = response.headers['x-correlation-id'];
        const error = classifyHttpFailure(
          response.statusCode ?? 0,
          Buffer.concat(chunks).toString('utf8'),
          typeof header === 'string' ? header : null,
        );
        link.finish({ code: response.statusCode ?? 0, error, reconcile: false });
      });
      response.on('error', (error) =>
        link.finish({ code: 0, error: classifyNetworkError(error, correlationId), reconcile: false }),
      );
    });
    socket.on('error', (error) => {
      if (!opened) link.finish({ code: 0, error: classifyNetworkError(error, correlationId), reconcile: false });
    });
    socket.on('close', (code) => {
      const error = code === CLOSE_CODES.normal || code === CLOSE_CODES.tryAgainLater ? null : closedUnexpectedly(code);
      link.finish({
        code,
        error: opened ? error : (error ?? classifyNetworkError(new Error('closed'), correlationId)),
        reconcile: false,
      });
    });
  }

  /** Closes with 1000 and stops the keep-alive. A pending close is not reported to the handlers. */
  disconnect(): void {
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.removeAllListeners('message');
    socket.on('error', () => undefined);
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    else closeSocket(socket, CLOSE_CODES.normal, 'client closing');
  }

  private handle(link: Link, message: ServerMessage): void {
    switch (message.type) {
      case 'hello':
        return this.onHello(link, message);
      case 'event':
        return this.onEvent(link, message);
      case 'reconciliation-required':
        return this.reconcile(link, message.reason);
      case 'error':
        link.socket.removeAllListeners('message');
        closeSocket(link.socket, CLOSE_CODES.normal, 'sidecar reported an error');
        link.finish({ code: CLOSE_CODES.policyViolation, error: fromErrorEnvelope(message.error), reconcile: false });
        return;
      case 'pong':
        return;
    }
  }

  private onHello(link: Link, hello: Extract<ServerMessage, { type: 'hello' }>): void {
    this.streamInstanceId = hello.streamInstanceId;
    const cursor = this.lastCursor;
    // The expected sequence only exists when resuming a known cursor. Without one this is a fresh start.
    this.expectedSequence = cursor ? (parseCursor(cursor)?.sequence ?? 0) + 1 : null;
    link.socket.send(JSON.stringify({ type: 'resume', wireVersion: WIRE_VERSION, ...(cursor ? { cursor } : {}) }));
    this.startPing(link.socket);
    link.handlers.onHello();
  }

  private onEvent(link: Link, message: Extract<ServerMessage, { type: 'event' }>): void {
    const { event } = message;
    if (!this.seen.add(event.eventId)) return; // a duplicate: consumers see it once
    const wrongStream = this.streamInstanceId !== null && event.streamInstanceId !== this.streamInstanceId;
    const gap = this.expectedSequence !== null && event.sequence !== this.expectedSequence;
    if (wrongStream || gap) return this.reconcile(link, wrongStream ? 'foreign-stream' : 'sequence-gap');
    this.expectedSequence = event.sequence + 1;
    this.lastCursor = message.cursor;
    link.handlers.onEvent({ cursor: message.cursor, event });
  }

  /** Nothing is skipped silently: the consumer is told, state is dropped, and the next connection starts fresh. */
  private reconcile(link: Link, reason: ReconciliationReason): void {
    this.reset();
    link.handlers.onReconciliationRequired(reason);
    this.stopPing();
    link.socket.removeAllListeners('message');
    closeSocket(link.socket, CLOSE_CODES.normal, 'reconciliation required');
    link.finish({ code: CLOSE_CODES.normal, error: null, reconcile: true });
  }

  private protocolError(link: Link): void {
    link.socket.removeAllListeners('message');
    closeSocket(link.socket, CLOSE_CODES.policyViolation, 'invalid message');
    link.finish({ code: CLOSE_CODES.policyViolation, error: protocolError(), reconcile: false });
  }

  /** Detects half-open connections: no message (not even a pong) within two intervals means the link is dead. */
  private watch(link: Link): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      link.finish({ code: 0, error: streamSilent(), reconcile: false });
      link.socket.terminate();
    }, this.pingIntervalMs * 2);
    this.watchdog.unref();
  }

  private startPing(socket: WebSocket): void {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'ping', wireVersion: WIRE_VERSION }));
    }, this.pingIntervalMs);
    this.pingTimer.unref();
  }

  private stopPing(): void {
    clearInterval(this.pingTimer);
    clearTimeout(this.watchdog);
    this.pingTimer = this.watchdog = undefined;
  }
}

/** A close frame the other side never answers would keep the socket for ws's 30 s close timeout. */
const CLOSE_GRACE_MS = 1_000;

/** Sends a close frame and, should the other side never answer it, drops the socket shortly after. */
function closeSocket(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState === WebSocket.OPEN) socket.close(code, reason);
  if (socket.readyState === WebSocket.CLOSED) return;
  const timer = setTimeout(() => socket.terminate(), CLOSE_GRACE_MS);
  timer.unref();
  socket.once('close', () => clearTimeout(timer));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
