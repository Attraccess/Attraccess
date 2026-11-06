import {
  COMPATIBILITY_TABLE,
  UNAUTHORIZED_MESSAGE,
  WIRE_VERSION,
  combinationForPlugin,
  expectedSidecarVersion,
  isHostSupported,
  type CapabilityReport,
  type ErrorCode,
  type OperationId,
  type OperationResponse,
} from '@attraccess/matter-contract';
import { BACKOFF_CAP_MS, STABLE_AFTER_MS, backoffDelay } from './backoff';
import {
  SidecarClientError,
  SidecarIncompatibleError,
  type ClientErrorKind,
  SidecarMisconfiguredError,
  SidecarUnavailableError,
} from './errors';
import {
  SidecarEventStream,
  type ReconciliationReason,
  type StreamClose,
  type StreamEvent,
  type StreamHandlers,
} from './event-stream';
import { SidecarHttpClient, type CallOptions, type SidecarClientConfig } from './rest-client';
import { isInsecureTransport } from './url';

export type ConnectionState = 'not_configured' | 'connecting' | 'connected' | 'degraded';
export type DegradedReason = 'unavailable' | 'unauthorized' | 'incompatible' | 'misconfigured';

export type SidecarVersionInfo = Awaited<ReturnType<SidecarHttpClient['version']>>;

export type ConnectionStatus = {
  state: ConnectionState;
  reason: DegradedReason | null;
  /** Human-readable cause when the reason alone is not enough, such as "host version unavailable". */
  reasonDetail: string | null;
  since: string;
  /** Redacted: the contract code, the sidecar's own message and the correlation ID. Never a credential. */
  lastError: {
    code: ErrorCode | string;
    message: string;
    correlationId: string | null;
    details?: Record<string, unknown>;
  } | null;
  nextRetryAt: string | null;
  sidecar: SidecarVersionInfo | null;
  wireVersion: number;
  capabilities: CapabilityReport | null;
  insecureTransport: boolean;
  /** The release combinations this plugin accepts. */
  supported: typeof COMPATIBILITY_TABLE;
};

export type ConnectionLogger = { debug(message: string): void; warn(message: string): void };

export type ConnectionOptions = {
  hostVersion: string | undefined;
  pluginVersion: string;
  logger: ConnectionLogger;
  requestTimeoutMs?: number;
  pingIntervalMs?: number;
  /** How long a connection must stay up before the backoff starts over. */
  stableAfterMs?: number;
  now?: () => number;
  random?: () => number;
};

/** `null`: not a failure of the connection, such as a request this client cancelled itself. */
const REASON_BY_KIND: Record<ClientErrorKind, DegradedReason | null> = {
  unavailable: 'unavailable',
  timeout: 'unavailable',
  request: 'unavailable',
  unauthorized: 'unauthorized',
  incompatible: 'incompatible',
  misconfigured: 'misconfigured',
  aborted: null,
};

/**
 * Keeps the plugin connected to the Matter sidecar. It never throws into the plugin: every failure becomes a
 * `degraded` state with a reason, a redacted last error and the time of the next attempt.
 */
export class SidecarConnection {
  private config: SidecarClientConfig | null = null;
  private client: SidecarHttpClient | null = null;
  private stream: SidecarEventStream | null = null;
  private generation = 0;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | undefined;
  private stableTimer: NodeJS.Timeout | undefined;
  private stopped = false;
  private state: ConnectionState = 'not_configured';
  private reason: DegradedReason | null = null;
  private reasonDetail: string | null = null;
  private since: number;
  private lastError: ConnectionStatus['lastError'] = null;
  private nextRetryAt: number | null = null;
  private sidecar: SidecarVersionInfo | null = null;
  private capabilities: CapabilityReport | null = null;
  private readonly eventHandlers = new Set<(event: StreamEvent) => void>();
  private readonly reconcileHandlers = new Set<(reason: ReconciliationReason) => void>();
  private readonly stateHandlers = new Set<(status: ConnectionStatus) => void>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: ConnectionOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.since = this.now();
  }

  // --- in-plugin API for the Matter features -------------------------------------------------------------------

  onEvent(handler: (event: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** The stream could not be resumed (or had a gap): consumers must reconcile their state with the sidecar. */
  onReconciliationRequired(handler: (reason: ReconciliationReason) => void): () => void {
    this.reconcileHandlers.add(handler);
    return () => this.reconcileHandlers.delete(handler);
  }

  onStateChange(handler: (status: ConnectionStatus) => void): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /** Performs one contract operation. Never retried here: a failed physical operation must not be repeated blindly. */
  async request<Id extends OperationId>(
    operation: Id,
    options: CallOptions<Id> = {} as CallOptions<Id>,
  ): Promise<OperationResponse<Id>> {
    const client = this.client;
    if (!client || this.state !== 'connected') {
      throw new SidecarUnavailableError('The Matter sidecar is not connected.');
    }
    return client.call(operation, options);
  }

  status(): ConnectionStatus {
    return {
      state: this.state,
      reason: this.reason,
      reasonDetail: this.reasonDetail,
      since: new Date(this.since).toISOString(),
      lastError: this.lastError,
      nextRetryAt: this.nextRetryAt === null ? null : new Date(this.nextRetryAt).toISOString(),
      sidecar: this.sidecar,
      wireVersion: WIRE_VERSION,
      capabilities: this.state === 'connected' ? this.capabilities : null,
      insecureTransport: isInsecureTransport(this.config?.url ?? null),
      supported: COMPATIBILITY_TABLE,
    };
  }

  // --- lifecycle ----------------------------------------------------------------------------------------------

  /**
   * Applies new settings and reconnects immediately. `null` clears the configuration and stops. The event stream
   * keeps its cursor, so events published meanwhile are replayed; a different sidecar answers the foreign cursor
   * with reconciliation-required.
   */
  configure(config: SidecarClientConfig | null): void {
    if (this.stopped) return;
    this.teardown();
    this.generation += 1;
    this.attempt = 0;
    this.config = config;
    this.sidecar = null;
    this.capabilities = null;
    this.lastError = null;
    this.nextRetryAt = null;
    if (!config) return this.setState('not_configured', null, null);
    this.setState('connecting', null, null);
    void this.run(this.generation);
  }

  /** The saved settings cannot be used (such as an undecryptable credential). Degraded until they are replaced. */
  misconfigure(message: string): void {
    if (this.stopped) return;
    this.teardown();
    this.generation += 1;
    this.config = null;
    this.sidecar = null;
    this.capabilities = null;
    this.nextRetryAt = null;
    this.lastError = { code: 'invalid_credential', message, correlationId: null };
    this.setState('degraded', 'misconfigured', null);
  }

  /** Aborts in-flight requests, closes the WebSocket and clears every timer. The connection cannot be restarted. */
  stop(): void {
    this.stopped = true;
    this.teardown();
    this.generation += 1;
  }

  /** No request, socket or timer outlives the generation that created it. */
  private teardown(): void {
    clearTimeout(this.retryTimer);
    clearTimeout(this.stableTimer);
    this.retryTimer = this.stableTimer = undefined;
    this.stream?.disconnect();
    this.client?.close();
    this.client = null;
  }

  // --- connect loop ---------------------------------------------------------------------------------------------

  private async run(generation: number): Promise<void> {
    const config = this.config;
    if (!config) return;
    try {
      const { hostVersion, pluginVersion } = this.options;
      if (!hostVersion) {
        throw new SidecarIncompatibleError('The Attraccess host version is unavailable. Upgrade Attraccess.', {
          details: { reason: 'host version unavailable', supported: COMPATIBILITY_TABLE },
        });
      }
      const expectedSidecar = expectedSidecarVersion(pluginVersion);
      // configure(), fail() and stop() drop the client, so one that is still here belongs to this configuration: the
      // event stream closed cleanly and only it reconnects. Requests in flight on the client must not be cut off.
      const client =
        this.client ??
        new SidecarHttpClient(
          config,
          { attraccessVersion: hostVersion, pluginVersion, sidecarVersion: expectedSidecar ?? pluginVersion },
          this.options.requestTimeoutMs,
        );
      this.client = client;
      const version = await client.version();
      if (generation !== this.generation) return;
      this.sidecar = version;
      this.assertCompatible(hostVersion, pluginVersion, version);
      const capabilities = await client.capabilities();
      if (generation !== this.generation) return;
      this.capabilities = capabilities;
      this.openStream(generation, config.url);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  /** The local half of the compatibility check; the sidecar enforces the same table on every versioned request. */
  private assertCompatible(hostVersion: string, pluginVersion: string, version: SidecarVersionInfo): void {
    const expected = combinationForPlugin(pluginVersion);
    const received = {
      attraccess: hostVersion,
      plugin: pluginVersion,
      sidecar: version.sidecar,
      matterJs: version.matterJs,
    };
    const supported =
      expected !== undefined &&
      isHostSupported(pluginVersion, hostVersion) &&
      expected.sidecar === version.sidecar &&
      expected.matterJs === version.matterJs;
    if (!supported) {
      throw new SidecarIncompatibleError(
        'Attraccess, the Matter plugin and the Matter sidecar are not a supported combination. ' +
          'Upgrade or downgrade one of them to a supported combination.',
        { details: { received: { wireVersion: version.wireVersion, ...received }, supported: COMPATIBILITY_TABLE } },
      );
    }
  }

  private openStream(generation: number, url: string): void {
    // One stream for the connection's lifetime: it keeps the cursor and the seen event IDs across reconnects and
    // settings changes. Each connection attempt reports to handlers bound to its own generation.
    const handlers = this.streamHandlers(generation);
    this.stream ??= new SidecarEventStream(
      () => this.client as SidecarHttpClient,
      handlers,
      this.options.pingIntervalMs,
    );
    try {
      this.stream.connect(url, handlers);
    } catch (error) {
      this.fail(generation, error);
    }
  }

  private streamHandlers(generation: number): StreamHandlers {
    return {
      onHello: () => this.onHello(generation),
      onEvent: (event) => {
        if (generation === this.generation) this.emit(this.eventHandlers, event);
      },
      onReconciliationRequired: (reason) => {
        if (generation !== this.generation) return;
        this.options.logger.debug(`event stream needs reconciliation (${reason})`);
        this.emit(this.reconcileHandlers, reason);
      },
      onClose: (close) => this.onStreamClose(generation, close),
    };
  }

  private onHello(generation: number): void {
    if (generation !== this.generation) return;
    this.lastError = null;
    this.nextRetryAt = null;
    this.setState('connected', null, null);
    clearTimeout(this.stableTimer);
    // A connection that stayed up for a while counts as healthy again: the next failure starts the backoff over.
    this.stableTimer = setTimeout(() => {
      this.attempt = 0;
    }, this.options.stableAfterMs ?? STABLE_AFTER_MS);
    this.stableTimer.unref();
  }

  private onStreamClose(generation: number, close: StreamClose): void {
    if (generation !== this.generation) return;
    clearTimeout(this.stableTimer);
    if (close.error) return this.fail(generation, close.error);
    // A reconciliation reconnects at once and fresh. A slow-client close (1013) or a clean close resumes with the
    // cursor after the backoff, so a sidecar that keeps closing is not hammered; a stable connection resets it.
    const delay = close.reconcile ? 0 : backoffDelay(this.attempt, this.random);
    if (!close.reconcile) this.attempt += 1;
    this.options.logger.debug(`event stream closed (${close.code}); reconnecting in ${delay} ms`);
    this.setState('connecting', null, null);
    this.scheduleRetry(generation, delay);
  }

  private fail(generation: number, error: unknown): void {
    if (generation !== this.generation) return;
    const failure = error instanceof SidecarClientError ? error : this.unexpected(error);
    const reason = REASON_BY_KIND[failure.kind];
    if (reason === null) return;
    this.stream?.disconnect();
    this.client?.close();
    this.client = null;
    this.capabilities = null;
    this.lastError = {
      code: failure.code,
      message: this.scrub(failure.message),
      correlationId: failure.correlationId,
      ...(failure.kind === 'incompatible' && failure.details ? { details: failure.details } : {}),
    };
    const detail = (failure.details as { reason?: unknown } | undefined)?.reason;
    this.setState('degraded', reason, typeof detail === 'string' ? detail : null);
    // Only an unreachable sidecar backs off progressively; a state an administrator must fix retries at the cap.
    const delay = reason === 'unavailable' ? backoffDelay(this.attempt, this.random) : BACKOFF_CAP_MS;
    this.attempt += 1;
    this.options.logger.debug(`degraded (${reason}); next attempt in ${delay} ms`);
    this.scheduleRetry(generation, delay);
  }

  private scheduleRetry(generation: number, delayMs: number): void {
    clearTimeout(this.retryTimer);
    this.nextRetryAt = this.now() + delayMs;
    this.retryTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.nextRetryAt = null;
      void this.run(generation);
    }, delayMs);
    this.retryTimer.unref();
  }

  // --- helpers ------------------------------------------------------------------------------------------------

  private setState(state: ConnectionState, reason: DegradedReason | null, detail: string | null): void {
    const changed = state !== this.state || reason !== this.reason;
    this.state = state;
    this.reason = reason;
    this.reasonDetail = detail;
    if (!changed) return;
    this.since = this.now();
    this.options.logger.debug(`connection ${state}${reason ? ` (${reason})` : ''}`);
    this.emit(this.stateHandlers, this.status());
  }

  /** A bug rather than a sidecar answer. Logged by name and message only, scrubbed, never with a stack. */
  private unexpected(error: unknown): SidecarClientError {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : 'a non-error value was thrown';
    this.options.logger.warn(`unexpected error in the Matter connection: ${this.scrub(text)}`);
    return new SidecarMisconfiguredError('The Matter connection could not be set up because of an unexpected error.', {
      code: 'internal_error',
    });
  }

  /** The token never reaches a message; this is the last line of defence should one ever echo it. */
  private scrub(text: string): string {
    const token = this.config?.token;
    const masked = token ? text.split(token).join('[redacted]') : text;
    // The sidecar's own 401 hint names the header format (`Bearer <token>`) and must reach the admin unchanged.
    return masked
      .split(UNAUTHORIZED_MESSAGE)
      .map((part) => part.replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [redacted]'))
      .join(UNAUTHORIZED_MESSAGE);
  }

  private emit<T>(handlers: Set<(value: T) => void>, value: T): void {
    for (const handler of handlers) {
      try {
        handler(value);
      } catch {
        this.options.logger.warn('a connection subscriber threw an error');
      }
    }
  }
}
