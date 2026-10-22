import { WebSocket, WebSocketServer } from 'ws';
import { ClientMessage, Id, ServerMessage, StreamReady } from '@attraccess/matter-contract';
import { EventStream } from './stream.js';
import { ProtocolError } from './errors.js';
import type { SidecarConfig } from './config.js';

export function attachClient(ws: WebSocket, requestId: string, stream: EventStream, config: SidecarConfig): void {
  const connectionRequestId = requestId;
  let unsubscribe: (() => void) | undefined;
  let subscribed = false;
  let closing = false;
  let replay: unknown[] = [];
  let replayIndex = 0;
  let ready: unknown | undefined;
  const pending: string[] = [];
  let pendingBytes = 0;
  let writingBytes = 0;
  let writeDeadline: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(writeDeadline);
    replay = [];
    ready = undefined;
    pending.length = 0;
    pendingBytes = 0;
    unsubscribe?.();
  };
  // Replay is pulled one message at a time. A healthy reconnect must not need
  // enough socket queue space for the entire retained history at once.
  const pump = () => {
    if (closing || writingBytes || ws.readyState !== WebSocket.OPEN) return;
    let data: string;
    if (replayIndex < replay.length) {
      data = JSON.stringify(ServerMessage.parse(replay[replayIndex]));
      replay[replayIndex++] = undefined;
    } else if (ready !== undefined) {
      replay = [];
      data = JSON.stringify(ServerMessage.parse(ready));
      ready = undefined;
    } else {
      const next = pending.shift();
      if (next === undefined) return;
      data = next;
      pendingBytes -= Buffer.byteLength(data);
    }
    const bytes = Buffer.byteLength(data);
    if (ws.bufferedAmount + pendingBytes + bytes > config.clientQueueBytes) {
      fail(stream.reconcile('slow_client'));
      return;
    }
    writingBytes = bytes;
    writeDeadline = setTimeout(() => fail(stream.reconcile('slow_client')), config.requestTimeoutMs);
    writeDeadline.unref();
    ws.send(data, (error) => {
      clearTimeout(writeDeadline);
      writingBytes = 0;
      if (error) {
        closing = true;
        cleanup();
        ws.terminate();
        return;
      }
      pump();
    });
  };
  const sendLive = (value: unknown) => {
    if (closing || ws.readyState !== WebSocket.OPEN) return;
    const data = JSON.stringify(ServerMessage.parse(value));
    const bytes = Buffer.byteLength(data);
    if (Math.max(ws.bufferedAmount, writingBytes) + pendingBytes + bytes > config.clientQueueBytes) {
      fail(stream.reconcile('slow_client'));
      return;
    }
    pending.push(data);
    pendingBytes += bytes;
    pump();
  };
  const fail = (error: ProtocolError, code = 4009) => {
    if (closing) return;
    closing = true;
    cleanup();
    if (ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(error.envelope(requestId));
      if (ws.bufferedAmount + Buffer.byteLength(data) <= config.clientQueueBytes) {
        ws.send(data);
      } else {
        // The envelope cannot fit; keep reconciliation guidance in the close frame.
        error = stream.reconcile('slow_client');
        code = 4009;
      }
    }
    ws.close(
      code,
      error.code === 'RECONCILIATION_REQUIRED' ? 'Reconciliation required: snapshots unavailable' : error.code,
    );
    const kill = setTimeout(() => ws.terminate(), Math.min(1000, config.shutdownMs));
    kill.unref();
    ws.once('close', () => clearTimeout(kill));
  };
  const initialDeadline = setTimeout(
    () => fail(new ProtocolError('TIMEOUT', 'Send a validated resume message before the stream deadline.'), 4008),
    config.resumeTimeoutMs,
  );
  initialDeadline.unref();
  ws.on('message', (bytes, isBinary) => {
    requestId = connectionRequestId;
    try {
      if (isBinary) throw new ProtocolError('VALIDATION_ERROR', 'Only JSON text WebSocket messages are supported.');
      let value: unknown;
      try {
        value = JSON.parse(bytes.toString());
      } catch {
        throw new ProtocolError('VALIDATION_ERROR', 'Malformed JSON WebSocket message.');
      }
      if (typeof value === 'object' && value !== null && 'requestId' in value) {
        const correlation = Id.safeParse(value.requestId);
        if (correlation.success) requestId = correlation.data;
      }
      const parsed = ClientMessage.safeParse(value);
      if (!parsed.success) {
        const version =
          typeof value === 'object' && value !== null && 'schemaVersion' in value ? value.schemaVersion : undefined;
        if (version !== 1)
          throw new ProtocolError('UNSUPPORTED_WIRE_VERSION', 'Only schemaVersion 1 is supported.', {
            supportedWireVersions: [1],
          });
        const messageId =
          typeof value === 'object' && value !== null && 'requestId' in value ? value.requestId : undefined;
        if (!Id.safeParse(messageId).success)
          throw new ProtocolError('VALIDATION_ERROR', 'A UUID requestId is required.');
        if (parsed.error.issues.every((issue) => issue.path[0] === 'cursor')) throw stream.reconcile('malformed');
        throw new ProtocolError('VALIDATION_ERROR', 'Message does not match the stream request schema.');
      }
      if (subscribed)
        throw new ProtocolError(
          'VALIDATION_ERROR',
          'Only one resume request is permitted per connection. Reconnect to resume again.',
        );
      const result = stream.resume(parsed.data.cursor, (event) => {
        sendLive(event);
      });
      unsubscribe = result.unsubscribe;
      subscribed = true;
      clearTimeout(initialDeadline);
      replay = result.replay;
      ready = StreamReady.parse({
        schemaVersion: 1,
        type: 'stream.ready',
        requestId,
        watermark: result.watermark,
        delivery: 'at_least_once',
      });
      pump();
    } catch (error) {
      fail(
        error instanceof ProtocolError
          ? error
          : new ProtocolError('INTERNAL_ERROR', 'Unable to process the stream message.'),
      );
    }
  });
  ws.on('error', () => {
    // Parser failures (including maxPayload) have already started closing the
    // socket. They use WebSocket close codes, not application error envelopes.
    closing = true;
    cleanup();
  });
  ws.once('close', () => {
    clearTimeout(initialDeadline);
    closing = true;
    cleanup();
  });
}
export function createWebSocketServer(config: SidecarConfig): WebSocketServer {
  return new WebSocketServer({ noServer: true, maxPayload: config.payloadBytes, perMessageDeflate: false });
}
