import {
  CLOSE_CODES,
  FEATURE_FAMILIES,
  OPERATIONS,
  type CapabilityReport,
  type FeatureFamily,
} from '@attraccess/matter-contract';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SidecarConfig } from './config';
import { EventStream } from './event-stream';
import { correlationIdFrom, sendError } from './http-utils';
import { createLogger, type Logger } from './logger';
import { loadMatterPlatform, type MatterPlatform } from './matter-platform';
import { handleRequest, type FeatureHandlers, type PipelineDeps } from './request-pipeline';
import { SIDECAR_VERSION, versionInfo } from './version';
import { WebSocketHub } from './websocket-hub';

export type SidecarOptions = {
  config: SidecarConfig;
  logger?: Logger;
  /** Simulated or real feature handlers, keyed by operation ID. Families without a handler are unavailable. */
  features?: FeatureHandlers;
  loadPlatform?: () => Promise<MatterPlatform>;
  now?: () => number;
  commit?: string;
};

export type Sidecar = {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  readonly stream: EventStream;
  readonly state: { ready: boolean; draining: boolean };
};

const PRUNE_INTERVAL_MS = 10_000;

export function capabilityReport(features: FeatureHandlers): CapabilityReport {
  const available = new Set<FeatureFamily>(['health']);
  for (const operation of OPERATIONS) if (features[operation.id]) available.add(operation.family);
  return {
    capabilities: FEATURE_FAMILIES.map((family) =>
      available.has(family)
        ? { family, defined: true as const, available: true }
        : { family, defined: true as const, available: false, reason: 'Not implemented in this sidecar release.' },
    ),
  };
}

export function createSidecar(options: SidecarOptions): Sidecar {
  const { config } = options;
  const logger = options.logger ?? createLogger();
  const features = options.features ?? {};
  const state = { configuration: true, matterPlatform: false, transport: false, ready: false, draining: false };
  const stream = new EventStream({
    maxEvents: config.replayMaxEvents,
    maxAgeMs: config.replayMaxAgeMs,
    now: options.now,
  });
  let platform: MatterPlatform | null = null;
  let server: Server | null = null;
  let hub: WebSocketHub | null = null;
  let pruneTimer: NodeJS.Timeout | undefined;
  let stopping: Promise<void> | null = null;
  const running = { sidecar: SIDECAR_VERSION, matterJs: '' };

  const readiness = () => {
    const status = state.draining ? 'draining' : state.ready ? 'ready' : 'starting';
    return {
      status: state.ready && !state.draining ? 200 : 503,
      body: {
        status,
        checks: {
          configuration: state.configuration,
          matterPlatform: state.matterPlatform,
          transport: state.transport,
          shuttingDown: state.draining,
        },
        fabric: { state: 'uninitialized' as const },
      },
    };
  };

  const deps: PipelineDeps = {
    config,
    running,
    logger,
    isDraining: () => state.draining,
    features,
    builtIns: {
      'health.live': () => ({ status: 200, body: { status: 'live' } }),
      'health.ready': readiness,
      'health.version': () => ({ status: 200, body: versionInfo(running.matterJs, options.commit) }),
      'health.capabilities': () => ({ status: 200, body: capabilityReport(features) }),
    },
  };

  const listen = (instance: Server) =>
    new Promise<number>((resolve, reject) => {
      instance.once('error', reject);
      instance.listen(config.port, config.host, () => resolve((instance.address() as AddressInfo).port));
    });

  async function start() {
    try {
      return await startUnsafe();
    } catch (error) {
      // The shared stop path closes the platform once; a later stop() joins it instead of closing again.
      await stop().catch(() => undefined);
      throw error;
    }
  }

  /** Every wait during startup can overlap a stop(); bail out so a late start never revives a stopped sidecar. */
  function assertNotStopping() {
    if (state.draining) throw new Error('The sidecar was stopped while starting.');
  }

  async function startUnsafe() {
    const loaded = await (options.loadPlatform ?? loadMatterPlatform)();
    if (state.draining) {
      // stop() already finished without seeing this platform, so nobody else will close it.
      await loaded.close();
      assertNotStopping();
    }
    platform = loaded;
    running.matterJs = loaded.version;
    state.matterPlatform = true;
    hub = new WebSocketHub(config, stream, running, () => state.draining, logger);
    server = createServer((req, res) => {
      req.on('error', () => undefined);
      res.on('error', () => undefined);
      handleRequest(req, res, deps).catch(() =>
        sendError(res, { code: 'internal_error', message: 'The request failed.' }, correlationIdFrom(req.headers)),
      );
    });
    // Bounds the whole request including a slow body, so the configured deadline also covers reading it.
    server.requestTimeout = config.requestDeadlineMs;
    server.headersTimeout = Math.min(config.requestDeadlineMs, 30_000);
    server.on('upgrade', (req, socket, head) => hub?.handleUpgrade(req, socket, head));
    server.on('clientError', (_error, socket) => socket.destroy());
    const instance = server;
    const port = await listen(instance);
    // A stop() that ran during listen() saw a server that was not listening yet, so this one must close it itself.
    if (state.draining) await new Promise<void>((resolve) => instance.close(() => resolve()));
    assertNotStopping();
    state.transport = true;
    state.ready = true;
    pruneTimer = setInterval(() => stream.prune(), PRUNE_INTERVAL_MS);
    pruneTimer.unref();
    stream.publish('sidecar.lifecycle', { phase: 'started' });
    stream.publish('sidecar.capabilities', capabilityReport(features));
    logger('info', 'listening', { host: config.host, port });
    return { port };
  }

  async function shutdown() {
    state.draining = true;
    clearInterval(pruneTimer);
    const active = server;
    if (!active?.listening) {
      await closePlatform();
      state.ready = false;
      return;
    }
    stream.publish('sidecar.lifecycle', { phase: 'draining' });
    const closed = new Promise<void>((resolve) => active.close(() => resolve()));
    hub?.closeAll(CLOSE_CODES.goingAway, 'sidecar shutting down');
    active.closeIdleConnections();
    const grace = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), config.shutdownGraceMs).unref(),
    );
    if ((await Promise.race([closed.then(() => 'closed' as const), grace])) === 'timeout') {
      hub?.terminateAll();
      active.closeAllConnections();
      await closed;
    }
    await closePlatform();
    state.ready = false;
  }

  async function closePlatform() {
    const active = platform;
    platform = null;
    await active?.close();
  }

  const stop = () => (stopping ??= shutdown());

  return {
    start,
    stop,
    stream,
    state: {
      get ready() {
        return state.ready && !state.draining;
      },
      get draining() {
        return state.draining;
      },
    },
  };
}
