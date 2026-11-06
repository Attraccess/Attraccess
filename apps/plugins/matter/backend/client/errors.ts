import { errorEnvelopeSchema, type ErrorCode, type ErrorEnvelope } from '@attraccess/matter-contract';

export type ClientErrorKind =
  'unavailable' | 'unauthorized' | 'incompatible' | 'timeout' | 'misconfigured' | 'aborted' | 'request';

export type ClientErrorInit = {
  /** The sidecar's contract error code, when it sent one. */
  code?: ErrorCode | 'network' | 'tls' | 'invalid_url' | 'invalid_response' | 'invalid_credential';
  correlationId?: string | null;
  retryable?: boolean;
  /** `uncertain`: the effect on the physical device is unknown. */
  outcome?: 'uncertain';
  details?: Record<string, unknown>;
  status?: number;
};

/** Base of every typed error the sidecar client throws. Messages never contain the token or the Authorization header. */
export class SidecarClientError extends Error {
  readonly code: NonNullable<ClientErrorInit['code']>;
  readonly correlationId: string | null;
  readonly retryable: boolean;
  readonly outcome?: 'uncertain';
  readonly details?: Record<string, unknown>;
  readonly status?: number;

  constructor(
    readonly kind: ClientErrorKind,
    message: string,
    init: ClientErrorInit = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = init.code ?? 'internal_error';
    this.correlationId = init.correlationId ?? null;
    this.retryable = init.retryable ?? false;
    this.outcome = init.outcome;
    this.details = init.details;
    this.status = init.status;
  }
}

export class SidecarUnavailableError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('unavailable', message, { retryable: true, code: 'sidecar_unavailable', ...init });
  }
}
export class SidecarUnauthorizedError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('unauthorized', message, { code: 'unauthorized', ...init });
  }
}
export class SidecarIncompatibleError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('incompatible', message, { code: 'incompatible_release', ...init });
  }
}
export class SidecarTimeoutError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('timeout', message, { code: 'timeout', ...init });
  }
}
/** A bad URL, CA or TLS failure: only an administrator can fix it. */
export class SidecarMisconfiguredError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('misconfigured', message, init);
  }
}
export class SidecarAbortedError extends SidecarClientError {
  constructor(message = 'The request was cancelled.', init: ClientErrorInit = {}) {
    super('aborted', message, init);
  }
}
/** The sidecar answered with a contract error that is none of the above (validation, unsupported capability, ...). */
export class SidecarRequestError extends SidecarClientError {
  constructor(message: string, init: ClientErrorInit = {}) {
    super('request', message, init);
  }
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNABORTED',
]);

/** OpenSSL and Node TLS error codes: certificate verification or the handshake itself failed. */
const TLS_CODE = /^(ERR_TLS|ERR_SSL|ERR_OSSL|CERT_|UNABLE_TO_|DEPTH_ZERO|SELF_SIGNED|HOSTNAME_MISMATCH)/;

/** Said of a physical operation whose request may already have reached the sidecar. */
export const UNCERTAIN_HINT = 'The effect on the device is uncertain; do not retry automatically.';

/**
 * Maps a low-level connection failure to a typed error. TLS trust problems are configuration problems; everything
 * else means the sidecar cannot be reached. `outcome: 'uncertain'` marks a physical operation that may have been
 * delivered, which is then never retryable.
 */
export function classifyNetworkError(
  error: unknown,
  correlationId: string | null = null,
  outcome?: 'uncertain',
): SidecarClientError {
  if (error instanceof SidecarClientError) return error;
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw : '';
  const uncertain = outcome === 'uncertain' ? { outcome, retryable: false } : {};
  const suffix = outcome === 'uncertain' ? ` ${UNCERTAIN_HINT}` : '';
  if (NETWORK_CODES.has(code)) {
    return new SidecarUnavailableError(`The Matter sidecar is not reachable (${code}).${suffix}`, {
      code: 'network',
      correlationId,
      ...uncertain,
    });
  }
  // The code decides; a message is only consulted when there is no code, since host names and socket messages can
  // contain "tls" without being a TLS failure.
  const message = error instanceof Error ? error.message : '';
  if (code ? TLS_CODE.test(code) : /certificate|self[- ]signed/i.test(message)) {
    return new SidecarMisconfiguredError(
      'The TLS connection to the Matter sidecar failed certificate verification. ' +
        'Check the URL host name and the CA certificate.',
      { code: 'tls', correlationId },
    );
  }
  return new SidecarUnavailableError(`The Matter sidecar is not reachable.${suffix}`, {
    code: 'network',
    correlationId,
    ...uncertain,
  });
}

/** A contract error the sidecar sent, as an HTTP envelope or as an event-stream `error` message. */
export function fromErrorEnvelope(error: ErrorEnvelope['error'], status?: number): SidecarClientError {
  const { code, message, correlationId, retryable, outcome, details } = error;
  const init: ClientErrorInit = { code, correlationId, retryable, outcome, details, status };
  if (code === 'unauthorized') return new SidecarUnauthorizedError(message, init);
  if (code === 'incompatible_release' || code === 'unsupported_wire_version') {
    return new SidecarIncompatibleError(message, init);
  }
  if (code === 'sidecar_unavailable') return new SidecarUnavailableError(message, init);
  if (code === 'timeout') return new SidecarTimeoutError(message, init);
  if (code === 'forbidden_origin') return new SidecarMisconfiguredError(message, init);
  return new SidecarRequestError(message, init);
}

/** The sidecar sent an event-stream message that is not valid JSON of the contract. */
export function protocolError(): SidecarClientError {
  return new SidecarUnavailableError('The Matter sidecar sent an event-stream message that violates the contract.', {
    code: 'invalid_response',
  });
}

/** The event stream ended with a close code that is neither a clean close nor "try again later". */
export function closedUnexpectedly(closeCode: number): SidecarClientError {
  return new SidecarUnavailableError(
    closeCode === 1006
      ? 'The event stream to the Matter sidecar was cut off without a close frame.'
      : `The Matter sidecar closed the event stream (WebSocket close code ${closeCode}).`,
    { code: 'network' },
  );
}

/** The link went silent: not even a pong arrived within two ping intervals. */
export function streamSilent(): SidecarClientError {
  return new SidecarUnavailableError('The event stream to the Matter sidecar stopped answering pings.', {
    code: 'network',
  });
}

/** Turns a non-2xx HTTP answer (a contract error envelope or foreign text from a proxy) into a typed error. */
export function classifyHttpFailure(
  status: number,
  raw: string,
  headerCorrelationId?: string | null,
  outcome?: 'uncertain',
): SidecarClientError {
  let envelope: ReturnType<typeof errorEnvelopeSchema.safeParse> | null = null;
  try {
    envelope = errorEnvelopeSchema.safeParse(JSON.parse(raw));
  } catch {
    envelope = null;
  }
  if (envelope?.success) return fromErrorEnvelope(envelope.data.error, status);
  // Not a contract answer: a reverse proxy or something else is in the way. Its body is never echoed.
  const init: ClientErrorInit = { status, correlationId: headerCorrelationId ?? null };
  if (status === 401) return new SidecarUnauthorizedError('The Matter sidecar rejected the credential.', init);
  if (status === 403) return new SidecarMisconfiguredError(`The request was refused (HTTP ${status}).`, init);
  if (status === 404 || status === 400) {
    return new SidecarMisconfiguredError(
      `The URL does not point at a Matter sidecar (HTTP ${status}). Check the path prefix.`,
      init,
    );
  }
  // A gateway error from a proxy may come after it forwarded the request: for a physical operation the effect is unknown.
  if (outcome === 'uncertain' && (status === 502 || status === 504)) {
    return new SidecarUnavailableError(`The Matter sidecar answered with HTTP ${status}. ${UNCERTAIN_HINT}`, {
      ...init,
      outcome,
      retryable: false,
    });
  }
  return new SidecarUnavailableError(`The Matter sidecar answered with HTTP ${status}.`, init);
}
