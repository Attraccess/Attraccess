import { errorEnvelopeSchema, type ErrorCode } from '@attraccess/matter-contract';

export type ClientErrorKind =
  'unavailable' | 'unauthorized' | 'incompatible' | 'timeout' | 'misconfigured' | 'aborted' | 'request';

export type ClientErrorInit = {
  /** The sidecar's contract error code, when it sent one. */
  code?: ErrorCode | 'network' | 'tls' | 'invalid_url' | 'invalid_response';
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
  constructor(message = 'The request was cancelled.') {
    super('aborted', message);
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

/** Maps a low-level connection failure to a typed error. TLS trust problems are configuration problems. */
export function classifyNetworkError(error: unknown): SidecarClientError {
  if (error instanceof SidecarClientError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const text = typeof code === 'string' ? code : '';
  const isTls =
    text.startsWith('ERR_TLS') ||
    text.startsWith('ERR_SSL') ||
    /^(DEPTH_ZERO|SELF_SIGNED|UNABLE_TO|CERT_|HOSTNAME_MISMATCH|ERR_OSSL)/.test(text) ||
    /certificate|self[- ]signed|tls|ssl/i.test(error instanceof Error ? error.message : '');
  if (isTls) {
    return new SidecarMisconfiguredError(
      'The TLS connection to the Matter sidecar failed certificate verification. ' +
        'Check the URL host name and the CA certificate.',
      { code: 'tls' },
    );
  }
  if (NETWORK_CODES.has(text)) {
    return new SidecarUnavailableError(`The Matter sidecar is not reachable (${text}).`, { code: 'network' });
  }
  return new SidecarUnavailableError('The Matter sidecar is not reachable.', { code: 'network' });
}

/** Turns a non-2xx HTTP answer (a contract error envelope or foreign text from a proxy) into a typed error. */
export function classifyHttpFailure(
  status: number,
  raw: string,
  headerCorrelationId?: string | null,
): SidecarClientError {
  let envelope: ReturnType<typeof errorEnvelopeSchema.safeParse> | null = null;
  try {
    envelope = errorEnvelopeSchema.safeParse(JSON.parse(raw));
  } catch {
    envelope = null;
  }
  if (envelope?.success) {
    const { code, message, correlationId, retryable, outcome, details } = envelope.data.error;
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
  return new SidecarUnavailableError(`The Matter sidecar answered with HTTP ${status}.`, init);
}
