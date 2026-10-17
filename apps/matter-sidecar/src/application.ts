import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import {
  Capabilities,
  INITIAL_CAPABILITIES,
  LiveResponse,
  ReadyResponse,
  VersionResponse,
  routes,
  schemas,
} from '@attraccess/matter-contract';
import { Config, type SidecarConfig } from './config.js';
import { ProtocolError, checkCompatibility, correlationId } from './errors.js';
import { EventStream } from './stream.js';
import { attachClient, createWebSocketServer } from './websocket.js';

export interface Platform {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
export interface ApplicationOptions {
  config?: Partial<SidecarConfig>;
  platform: Platform;
  version: unknown;
  now?: () => number;
}
export function createApplication(options: ApplicationOptions) {
  const config = Config.parse(options.config ?? {});
  const version = VersionResponse.parse(options.version);
  const stream = new EventStream(config.replayEvents, config.replayAgeMs, options.now);
  const sockets = new Set<Socket>();
  let ready = false;
  let draining = false;
  let initialization: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  const listenerAbort = new AbortController();
  const send = (res: ServerResponse, status: number, value: unknown, requestId: string) => {
    if (res.writableEnded || res.destroyed) return;
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-matter-wire-version': '1',
      'x-request-id': requestId,
    });
    res.end(JSON.stringify(value));
  };
  async function readBody(req: IncomingMessage): Promise<unknown> {
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
      throw new ProtocolError('VALIDATION_ERROR', 'Content-Type application/json is required.');
    if (Number(req.headers['content-length'] ?? 0) > config.payloadBytes)
      throw new ProtocolError('PAYLOAD_TOO_LARGE', 'JSON payload exceeds the configured limit.');
    const chunks = await new Promise<Buffer[]>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      const cleanup = () => {
        req.off('data', data);
        req.off('end', end);
        req.off('error', error);
        req.off('aborted', aborted);
      };
      const error = () => {
        cleanup();
        reject(new ProtocolError('VALIDATION_ERROR', 'Request upload interrupted.'));
      };
      const aborted = error;
      const end = () => {
        cleanup();
        resolve(chunks);
      };
      const data = (chunk: Buffer) => {
        size += chunk.length;
        if (size > config.payloadBytes) {
          req.pause();
          cleanup();
          reject(new ProtocolError('PAYLOAD_TOO_LARGE', 'JSON payload exceeds the configured limit.'));
        } else chunks.push(chunk);
      };
      req.on('data', data);
      req.once('end', end);
      req.once('error', error);
      req.once('aborted', aborted);
    });
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw new ProtocolError('VALIDATION_ERROR', 'Malformed JSON request.');
    }
  }
  const server = createServer((req, res) => {
    const requestId = correlationId(req.headers);
    let operationId: string | null = null;
    const timer = setTimeout(() => {
      send(
        res,
        504,
        new ProtocolError(
          'TIMEOUT',
          'Request deadline exceeded. Do not automatically retry an ambiguous physical command.',
        ).envelope(requestId, operationId),
        requestId,
      );
      // Cancel a stalled upload after writing its structured timeout response.
      res.once('finish', () => req.destroy());
    }, config.requestTimeoutMs);
    timer.unref();
    res.once('close', () => {
      clearTimeout(timer);
    });
    void (async () => {
      try {
        if (req.headers.origin !== undefined)
          throw new ProtocolError('FORBIDDEN_ORIGIN', 'Browser Origin requests are not allowed. Use the host plugin.');
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const operational = /^\/v\d+(?:\/|$)/.test(path);
        if (operational) {
          if (!/^\/v1(?:\/|$)/.test(path))
            throw new ProtocolError(
              'UNSUPPORTED_WIRE_VERSION',
              'Only /v1 is supported. Upgrade or downgrade to the supported release combination.',
              { supportedWireVersions: [1] },
            );
        }
        const route = routes.find((route) => route.path === path && route.method === req.method);
        if (!route) throw new ProtocolError('NOT_FOUND', 'Unknown route or method.');
        if (operational) {
          checkCompatibility(req.headers, version.sidecarRelease);
          if (!ready) throw new ProtocolError('UNAVAILABLE', 'Sidecar is not ready or is shutting down.');
        }
        if ('request' in route) {
          const body = await readBody(req);
          if (res.writableEnded) return;
          if (draining) throw new ProtocolError('UNAVAILABLE', 'Sidecar is shutting down.');
          const parsed = schemas[route.request].safeParse(body);
          if (!parsed.success)
            throw new ProtocolError(
              'VALIDATION_ERROR',
              'Request does not match the route schema. Inspect the generated contract; sensitive values are omitted from errors.',
            );
          if (
            typeof parsed.data === 'object' &&
            parsed.data !== null &&
            'operationId' in parsed.data &&
            typeof parsed.data.operationId === 'string'
          )
            operationId = parsed.data.operationId;
          if (
            typeof parsed.data === 'object' &&
            parsed.data !== null &&
            'deadline' in parsed.data &&
            typeof parsed.data.deadline === 'string' &&
            Date.parse(parsed.data.deadline) <= (options.now ?? Date.now)()
          )
            throw new ProtocolError(
              'TIMEOUT',
              'Operation deadline has elapsed. Physical commands must not be automatically retried.',
            );
        } else if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)
          throw new ProtocolError('VALIDATION_ERROR', 'This route does not accept a request body.');
        if ('capability' in route)
          throw new ProtocolError(
            'UNSUPPORTED_CAPABILITY',
            `Capability ${route.capability} is unavailable: not implemented in this foundation.`,
            { capability: route.capability },
          );
        let payload: unknown;
        let status = 200;
        if (path === '/health/live') payload = LiveResponse.parse({ schemaVersion: 1, live: true });
        else if (path === '/health/ready') {
          status = ready ? 200 : 503;
          payload = ReadyResponse.parse({
            schemaVersion: 1,
            ready,
            fabricInitialized: false,
            reason: ready ? null : draining ? 'Shutting down.' : 'Initialization incomplete.',
          });
        } else if (path === '/version') payload = version;
        else payload = Capabilities.parse(INITIAL_CAPABILITIES);
        send(res, status, schemas[route.response].parse(payload), requestId);
      } catch (error) {
        const failure =
          error instanceof ProtocolError
            ? error
            : new ProtocolError('INTERNAL_ERROR', 'Sidecar could not process this request.');
        send(res, failure.status, failure.envelope(requestId, operationId), requestId);
        // Rejected uploads cannot keep the process busy indefinitely.
        if (!req.complete) res.once('finish', () => req.destroy());
      }
    })();
  });
  server.maxHeadersCount = 32;
  server.headersTimeout = config.requestTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const wss = createWebSocketServer(config);
  server.on('upgrade', (req, socket, head) => {
    // Upgrade sockets are no longer covered by HTTP's error handling. A client
    // reset, including while we write a rejection, must stay local to its socket.
    socket.on('error', () => socket.destroy());
    const requestId = correlationId(req.headers);
    try {
      if (req.headers.origin !== undefined)
        throw new ProtocolError('FORBIDDEN_ORIGIN', 'Browser Origin requests are not allowed. Use the host plugin.');
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (/^\/v\d+(?:\/|$)/.test(path) && !/^\/v1(?:\/|$)/.test(path))
        throw new ProtocolError('UNSUPPORTED_WIRE_VERSION', 'Only /v1/events is supported.', {
          supportedWireVersions: [1],
        });
      if (path !== '/v1/events' || req.method !== 'GET')
        throw new ProtocolError('NOT_FOUND', 'WebSocket route is GET /v1/events.');
      checkCompatibility(req.headers, version.sidecarRelease);
      if (!ready) throw new ProtocolError('UNAVAILABLE', 'Sidecar is not ready or is shutting down.');
      wss.handleUpgrade(req, socket, head, (ws) => attachClient(ws, requestId, stream, config));
    } catch (error) {
      const failure =
        error instanceof ProtocolError
          ? error
          : new ProtocolError('INTERNAL_ERROR', 'Unable to accept WebSocket connection.');
      const body = JSON.stringify(failure.envelope(requestId));
      socket.end(
        `HTTP/1.1 ${failure.status} ${failure.code}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      );
    }
  });
  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    ready = false;
    shutdownPromise = (async () => {
      stream.publish({ type: 'lifecycle', payload: { state: 'draining' } });
      stream.dispose();
      const websocketClosed = [...wss.clients].map(
        (ws) =>
          new Promise<void>((resolve) => {
            ws.once('close', resolve);
            ws.close(1001, 'Sidecar shutting down');
          }),
      );
      const closed = new Promise<void>((resolve) => {
        // close() also cancels a pending bind before the listening event.
        server.close(() => resolve());
      });
      // A cancelled bind emits no listening event; release the startup waiter.
      listenerAbort.abort();
      // Initialization may install cleanup only after asynchronous acquisition.
      // Keep this chain alive even if the shutdown deadline wins the race, so
      // resources acquired later still receive cleanup, including failed starts.
      const dispose = initialization
        ? initialization.catch(() => undefined).then(() => options.platform.dispose())
        : Promise.resolve();
      // Disposal shares the same absolute shutdown budget as connection draining.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([closed, ...websocketClosed, dispose]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, config.shutdownMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        for (const ws of wss.clients) ws.terminate();
        for (const socket of sockets) socket.destroy();
        wss.close();
      }
    })();
    return shutdownPromise;
  }
  return {
    config,
    stream,
    server,
    get ready() {
      return ready;
    },
    async start() {
      if (draining || initialization) throw new Error('Application is already started or shutting down.');
      try {
        initialization = Promise.resolve().then(() => options.platform.initialize());
        await initialization;
        if (draining) throw new Error('Shutdown began during initialization.');
        server.listen(config.port, config.host);
        await once(server, 'listening', { signal: listenerAbort.signal }).catch((error) => {
          if (draining) throw new Error('Shutdown began while starting the listener.');
          throw error;
        });
        if (draining) throw new Error('Shutdown began while starting the listener.');
        ready = true;
        stream.publish({ type: 'lifecycle', payload: { state: 'ready' } });
        stream.publish({ type: 'capabilities', payload: INITIAL_CAPABILITIES });
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Unable to determine bound address.');
        return { port: address.port, url: `http://${config.host === '::1' ? '[::1]' : config.host}:${address.port}` };
      } catch (error) {
        await shutdown();
        throw error;
      }
    },
    shutdown,
  };
}
