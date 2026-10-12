import { WebSocket, WebSocketServer } from 'ws';
import { ClientMessage, ServerMessage, StreamReady } from '@attraccess/matter-contract';
import { EventStream } from './stream.js';
import { ProtocolError } from './errors.js';
import type { SidecarConfig } from './config.js';

export function attachClient(ws: WebSocket, requestId: string, stream: EventStream, config: SidecarConfig): void {
  let unsubscribe: (() => void) | undefined;
  let subscribed = false;
  let closing = false;
  const send = (value: unknown): boolean => {
    if (closing || ws.readyState !== WebSocket.OPEN) return false;
    const data = JSON.stringify(ServerMessage.parse(value));
    if (ws.bufferedAmount + Buffer.byteLength(data) > config.clientQueueBytes) {
      fail(stream.reconcile('slow_client'), 4009);
      return false;
    }
    ws.send(data, (error) => {
      if (error) ws.terminate();
    });
    return true;
  };
  const fail = (error: ProtocolError, code = 4009) => {
    if (closing) return;
    closing = true;
    unsubscribe?.();
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
      error.code === 'RECONCILIATION_REQUIRED' ? 'Reconciliation required: obtain a snapshot' : error.code,
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
    try {
      if (isBinary) throw new ProtocolError('VALIDATION_ERROR', 'Only JSON text WebSocket messages are supported.');
      let value: unknown;
      try {
        value = JSON.parse(bytes.toString());
      } catch {
        throw new ProtocolError('VALIDATION_ERROR', 'Malformed JSON WebSocket message.');
      }
      const parsed = ClientMessage.safeParse(value);
      if (!parsed.success) {
        const version =
          typeof value === 'object' && value !== null && 'schemaVersion' in value ? value.schemaVersion : undefined;
        if (version !== 1)
          throw new ProtocolError('UNSUPPORTED_WIRE_VERSION', 'Only schemaVersion 1 is supported.', {
            supportedWireVersions: [1],
          });
        throw stream.reconcile('malformed');
      }
      if (subscribed)
        throw new ProtocolError(
          'VALIDATION_ERROR',
          'Only one resume request is permitted per connection. Reconnect to resume again.',
        );
      requestId = parsed.data.requestId;
      const result = stream.resume(parsed.data.cursor, (event) => {
        send(event);
      });
      unsubscribe = result.unsubscribe;
      subscribed = true;
      clearTimeout(initialDeadline);
      for (const event of result.replay) if (!send(event)) break;
      send(
        StreamReady.parse({
          schemaVersion: 1,
          type: 'stream.ready',
          requestId,
          watermark: result.watermark,
          delivery: 'at_least_once',
        }),
      );
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
    unsubscribe?.();
  });
  ws.once('close', () => {
    clearTimeout(initialDeadline);
    unsubscribe?.();
  });
}
export function createWebSocketServer(config: SidecarConfig): WebSocketServer {
  return new WebSocketServer({ noServer: true, maxPayload: config.payloadBytes, perMessageDeflate: false });
}
