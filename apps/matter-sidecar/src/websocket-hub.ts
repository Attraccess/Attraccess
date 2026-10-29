import {
  CLOSE_CODES,
  EVENTS_PATH,
  buildError,
  clientMessageSchema,
  type ErrorCode,
  type ServerMessage,
  formatCursor,
  type EventEnvelope,
} from '@attraccess/matter-contract';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { checkAdmission, type RunningReleases } from './admission';
import type { SidecarConfig } from './config';
import { checkLocalAccess, correlationIdFrom, rejectUpgrade, type ErrorReply } from './http-utils';
import type { Logger } from './logger';
import type { EventStream } from './event-stream';

/** One WebSocket client of the event stream. Everything it sends, including errors, counts against its queue budget. */
class Client {
  private unsubscribe: (() => void) | null = null;
  private resumed = false;
  private pendingBytes = 0;

  constructor(
    private readonly socket: WebSocket,
    private readonly stream: EventStream,
    private readonly queueBudgetBytes: number,
  ) {
    socket.on('error', () => socket.terminate());
    socket.on('close', () => this.unsubscribe?.());
    socket.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    this.send({
      type: 'hello',
      wireVersion: 1,
      streamInstanceId: stream.streamInstanceId,
      headCursor: stream.headCursor,
    });
  }

  /** Returns false (and closes the client) when the queue budget would be exceeded. */
  send(message: ServerMessage): boolean {
    if (this.socket.readyState !== WebSocket.OPEN) return false;
    const text = JSON.stringify(message);
    const size = Buffer.byteLength(text);
    if (this.pendingBytes + this.socket.bufferedAmount + size > this.queueBudgetBytes) {
      this.unsubscribe?.();
      this.socket.close(CLOSE_CODES.tryAgainLater, 'client too slow; reconnect with the last cursor');
      return false;
    }
    this.pendingBytes += size;
    this.socket.send(text, () => {
      this.pendingBytes -= size;
    });
    return true;
  }

  private fail(code: ErrorCode, message: string): void {
    const envelope = buildError(code, message, randomUUID());
    if (this.send({ type: 'error', ...envelope })) this.socket.close(CLOSE_CODES.policyViolation, code);
  }

  private onMessage(data: unknown, isBinary: boolean): void {
    if (isBinary) return this.fail('validation_failed', 'Binary messages are not supported.');
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      return this.fail('validation_failed', 'Message is not valid JSON.');
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) return this.fail('validation_failed', 'Message does not match the wire contract.');
    if (parsed.data.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }
    if (this.resumed) return this.fail('validation_failed', 'The stream was already resumed on this connection.');
    this.resumed = true;
    this.resume(parsed.data.cursor);
  }

  private resume(cursor: string | undefined): void {
    if (cursor !== undefined) {
      const replay = this.stream.replayAfter(cursor);
      if (replay.kind === 'reconciliation-required') {
        this.send({
          type: 'reconciliation-required',
          reason: replay.reason,
          snapshot: 'unavailable',
          streamInstanceId: this.stream.streamInstanceId,
        });
        this.socket.close(CLOSE_CODES.normal, 'reconciliation required');
        return;
      }
      for (const event of replay.events) if (!this.sendEvent(event)) return;
    }
    // Same tick as the replay above: no event can be published in between, so no gap and no duplicate.
    this.unsubscribe = this.stream.subscribe((event) => this.sendEvent(event));
  }

  private sendEvent(event: EventEnvelope): boolean {
    return this.send({ type: 'event', cursor: formatCursor(event.streamInstanceId, event.sequence), event });
  }

  close(code: number, reason: string): void {
    this.unsubscribe?.();
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close(code, reason);
  }

  terminate(): void {
    this.socket.terminate();
  }
}

const MAX_CLIENTS = 64;
const FIRST_MESSAGE_TIMEOUT_MS = 30_000;

export class WebSocketHub {
  private readonly server: WebSocketServer;
  private readonly clients = new Set<Client>();

  constructor(
    private readonly config: SidecarConfig,
    private readonly stream: EventStream,
    private readonly running: RunningReleases,
    private readonly isDraining: () => boolean,
    private readonly logger: Logger,
  ) {
    // maxPayload makes the ws parser close oversized messages with 1009 before application code sees them.
    this.server = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes });
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Every refusal happens before the upgrade is accepted. Socket errors are handled first so a reset cannot crash us. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy());
    const correlationId = correlationIdFrom(req.headers);
    const refusal = this.refusal(req);
    if (refusal) return rejectUpgrade(socket, refusal, correlationId);
    this.server.handleUpgrade(req, socket, head, (ws) => {
      const client = new Client(ws, this.stream, this.config.clientQueueBytes);
      this.clients.add(client);
      // A client that never sends its resume message would otherwise stay open forever.
      const idle = setTimeout(
        () => client.close(CLOSE_CODES.policyViolation, 'no resume message'),
        FIRST_MESSAGE_TIMEOUT_MS,
      );
      idle.unref();
      ws.once('message', () => clearTimeout(idle));
      ws.on('close', () => {
        clearTimeout(idle);
        this.clients.delete(client);
      });
    });
  }

  private refusal(req: IncomingMessage): ErrorReply | null {
    const denied = checkLocalAccess(req.headers);
    if (denied) return { code: 'forbidden_origin', message: denied };
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== EVENTS_PATH) {
      return { code: 'not_found', message: 'Unknown path.' };
    }
    if (this.isDraining()) return { code: 'sidecar_unavailable', message: 'The Matter sidecar is shutting down.' };
    if (this.clients.size >= MAX_CLIENTS) {
      return { code: 'sidecar_unavailable', message: 'Too many event stream clients are connected.' };
    }
    const admission = checkAdmission(req.headers, this.running);
    return admission.ok ? null : { code: admission.code, message: admission.message, details: admission.details };
  }

  closeAll(code: number, reason: string): void {
    for (const client of this.clients) client.close(code, reason);
  }

  terminateAll(): void {
    for (const client of this.clients) client.terminate();
    this.logger('warn', 'terminated websocket clients that did not close in time', { count: this.clients.size });
  }
}
