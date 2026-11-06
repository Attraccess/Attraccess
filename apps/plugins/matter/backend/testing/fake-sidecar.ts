import {
  COMPATIBILITY_TABLE,
  FEATURE_FAMILIES,
  HEADER_ATTRACCESS_VERSION,
  HEADER_PLUGIN_VERSION,
  HEADER_SIDECAR_VERSION,
  HEADER_WIRE_VERSION,
  formatCursor,
  type EventEnvelope,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { TestCertificate } from './certs';

export const TOKEN = 'plugin-test-token-0123456789abcdef0123456789';
export const entry = COMPATIBILITY_TABLE[0];
export const HOST_VERSION = '1.11.0';

const reportBody = {
  capabilities: FEATURE_FAMILIES.map((family) => ({
    family,
    defined: true as const,
    available: family === 'health',
    ...(family === 'health' ? {} : { reason: 'Not implemented in this sidecar release.' }),
  })),
};

export type FakeOptions = {
  tokens?: string[];
  tls?: TestCertificate;
  /** A reverse-proxy path prefix the fake expects on every request. */
  prefix?: string;
  sidecarVersion?: string;
  /** Listen on a fixed port, such as the one a previous instance used. */
  port?: number;
};

const error = (res: ServerResponse, status: number, code: string, message: string, details?: unknown) => {
  const body = JSON.stringify({
    error: { code, message, correlationId: randomUUID(), retryable: status === 503, ...(details ? { details } : {}) },
  });
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

/** A stand-in for the Matter sidecar that speaks just enough of the wire contract for the client under test. */
export class FakeSidecar {
  readonly requests: { method: string; path: string; headers: IncomingMessage['headers'] }[] = [];
  readonly resumes: { cursor?: string }[] = [];
  readonly pings: number[] = [];
  readonly sockets = new Set<WebSocket>();
  streamInstanceId: string = randomUUID();
  tokens: string[];
  sidecarVersion: string;
  /** Answer REST requests with this instead of the normal behaviour. */
  restOverride: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;
  /** Called after each resume message, so a test can replay or refuse. */
  onResume: ((socket: WebSocket, message: { cursor?: string }) => void) | null = null;
  answerPings = true;
  private readonly server: Server;
  private readonly wss = new WebSocketServer({ noServer: true });
  port = 0;
  private seq = 0;

  private constructor(private readonly options: FakeOptions) {
    this.tokens = options.tokens ?? [TOKEN];
    this.sidecarVersion = options.sidecarVersion ?? entry.sidecar;
    const listener = (req: IncomingMessage, res: ServerResponse) => this.handle(req, res);
    this.server = options.tls
      ? createHttpsServer({ cert: options.tls.cert, key: options.tls.key }, listener)
      : createHttpServer(listener);
    this.server.on('upgrade', (req, socket, head) => {
      if (req.url !== `${options.prefix ?? ''}/v1/events`) {
        socket.end('HTTP/1.1 404 not_found\r\nconnection: close\r\n\r\n');
        return;
      }
      const refusal = this.refusal(req);
      if (refusal) {
        socket.end(
          `HTTP/1.1 ${refusal.status} refused\r\ncontent-type: application/json\r\nconnection: close\r\n\r\n${refusal.body}`,
        );
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
    });
  }

  static async start(options: FakeOptions = {}): Promise<FakeSidecar> {
    const fake = new FakeSidecar(options);
    await new Promise<void>((resolve) => fake.server.listen(options.port ?? 0, '127.0.0.1', () => resolve()));
    fake.port = (fake.server.address() as AddressInfo).port;
    return fake;
  }

  get url(): string {
    return `${this.options.tls ? 'https' : 'http'}://127.0.0.1:${this.port}${this.options.prefix ?? ''}`;
  }

  private authorized(req: IncomingMessage): boolean {
    return this.tokens.some((token) => req.headers.authorization === `Bearer ${token}`);
  }

  private releaseMatches(req: IncomingMessage): boolean {
    return (
      req.headers[HEADER_WIRE_VERSION] === '1' &&
      req.headers[HEADER_PLUGIN_VERSION] === entry.plugin &&
      req.headers[HEADER_SIDECAR_VERSION] === this.sidecarVersion &&
      typeof req.headers[HEADER_ATTRACCESS_VERSION] === 'string'
    );
  }

  private refusal(req: IncomingMessage): { status: number; body: string } | null {
    if (!this.authorized(req)) {
      return {
        status: 401,
        body: JSON.stringify({
          error: {
            code: 'unauthorized',
            message: 'A valid service token is required.',
            correlationId: randomUUID(),
            retryable: false,
          },
        }),
      };
    }
    if (!this.releaseMatches(req)) {
      return {
        status: 409,
        body: JSON.stringify({
          error: {
            code: 'incompatible_release',
            message: 'Not a supported combination.',
            correlationId: randomUUID(),
            retryable: false,
            details: { running: { sidecar: this.sidecarVersion }, supported: COMPATIBILITY_TABLE },
          },
        }),
      };
    }
    return null;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const prefix = this.options.prefix ?? '';
    const path = (req.url ?? '').slice(0, prefix.length) === prefix ? (req.url ?? '').slice(prefix.length) : null;
    this.requests.push({ method: req.method ?? '', path: path ?? req.url ?? '', headers: req.headers });
    if (path === null) return error(res, 404, 'not_found', 'Unknown path.');
    if (this.restOverride) return this.restOverride(req, res);
    if (!this.authorized(req)) return error(res, 401, 'unauthorized', 'A valid service token is required.');
    const json = (body: unknown) => {
      const text = JSON.stringify(body);
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    };
    if (path === '/version') {
      return json({
        build: { version: `${this.sidecarVersion}+abc`, commit: 'abc' },
        sidecar: this.sidecarVersion,
        matterJs: entry.matterJs,
        storageSchemaVersion: 1,
        wireVersion: 1,
      });
    }
    if (!this.releaseMatches(req)) {
      const refused = this.refusal(req) as { status: number; body: string };
      res.writeHead(refused.status, { 'content-type': 'application/json' });
      return void res.end(refused.body);
    }
    if (path === '/v1/capabilities') return json(reportBody);
    error(res, 404, 'not_found', 'Unknown path.');
  }

  private accept(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
    ws.on('error', () => undefined);
    ws.send(
      JSON.stringify({ type: 'hello', wireVersion: 1, streamInstanceId: this.streamInstanceId, headCursor: null }),
    );
    ws.on('message', (data) => {
      const message = JSON.parse(String(data));
      if (message.type === 'ping') {
        this.pings.push(Date.now());
        if (this.answerPings) ws.send(JSON.stringify({ type: 'pong' }));
      } else if (message.type === 'resume') {
        this.resumes.push({ cursor: message.cursor });
        this.onResume?.(ws, message);
      }
    });
  }

  /** A well-formed event with the next sequence number of the current stream instance. */
  nextEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
    this.seq += 1;
    return this.eventAt(this.seq, overrides);
  }

  eventAt(sequence: number, overrides: Partial<EventEnvelope> = {}): EventEnvelope {
    return {
      eventId: randomUUID(),
      schemaVersion: 1,
      type: 'sidecar.lifecycle',
      timestamp: new Date().toISOString(),
      correlation: { correlationId: randomUUID(), causationId: null, initiator: { userId: null, requestId: null } },
      streamInstanceId: this.streamInstanceId,
      sequence,
      payload: { phase: 'started' },
      ...overrides,
    } as EventEnvelope;
  }

  send(socket: WebSocket, event: EventEnvelope): void {
    socket.send(JSON.stringify({ type: 'event', cursor: formatCursor(event.streamInstanceId, event.sequence), event }));
  }

  broadcast(event: EventEnvelope): void {
    for (const socket of this.sockets) this.send(socket, event);
  }

  /** Drops every WebSocket without a close frame, like a killed process. */
  killSockets(): void {
    for (const socket of this.sockets) socket.terminate();
  }

  async stop(): Promise<void> {
    this.killSockets();
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
