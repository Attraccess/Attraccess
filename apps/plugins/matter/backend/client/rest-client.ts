import {
  DEFAULT_REQUEST_DEADLINE_MS,
  HEADER_CORRELATION_ID,
  MAX_MESSAGE_BYTES,
  OPERATIONS,
  buildRequestHeaders,
  type OperationBody,
  type OperationId,
  type OperationParams,
  type OperationResponse,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createSecureContext, getCACertificates, type SecureContext } from 'node:tls';
import type { z } from 'zod';
import {
  SidecarAbortedError,
  SidecarClientError,
  SidecarRequestError,
  SidecarTimeoutError,
  UNCERTAIN_HINT,
  classifyHttpFailure,
  classifyNetworkError,
} from './errors';
import { parseEndpoint, type SidecarEndpoint } from './url';

export type SidecarClientConfig = {
  url: string;
  /** The shared service token. Only ever sent as `Authorization: Bearer`; never logged or put in an error. */
  token: string;
  /** Extra PEM trust anchors, added to Node's default trust store. Certificate verification is always on. */
  caCertificate?: string | null;
};

/** The three releases the sidecar's admission check compares. */
export type ReleaseIdentity = { attraccessVersion: string; pluginVersion: string; sidecarVersion: string };

type RequestControl = {
  signal?: AbortSignal;
  timeoutMs?: number;
  correlationId?: string;
};

/** Options for one operation: its path parameters and body are typed from the contract. */
export type CallOptions<Id extends OperationId = OperationId> = RequestControl &
  (OperationParams<Id> extends undefined ? { params?: undefined } : { params: OperationParams<Id> }) &
  (OperationBody<Id> extends undefined ? { body?: undefined } : { body: OperationBody<Id> });

/** The sidecar answers a request that outlived its deadline itself; the client gives up a little later. */
const LOCAL_TIMEOUT_GRACE_MS = 1_000;

/**
 * TLS trust: Node's default store (its bundled roots plus `NODE_EXTRA_CA_CERTS` and, with `--use-system-ca`, the
 * system store) and the administrator's CA. Verification is never turned off.
 */
export function trustedAuthorities(caCertificate?: string | null): string[] {
  return caCertificate ? [...getCACertificates('default'), caCertificate] : [];
}

function readLimited(res: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        res.destroy();
        reject(new SidecarRequestError('The Matter sidecar answered with an oversized response.'));
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    res.on('error', reject);
    res.on('aborted', () => reject(new Error('aborted')));
  });
}

/**
 * Authenticated, version-checked REST client for the Matter sidecar. It never retries: whether a failed request may be
 * repeated is the caller's decision, and physical operations must not be repeated automatically.
 */
export class SidecarHttpClient {
  private readonly endpoint: SidecarEndpoint;
  private readonly lifecycle = new AbortController();
  /** Built once: parsing the whole trust store for every request and reconnect would be wasted work. */
  private readonly secureContext: SecureContext | undefined;

  constructor(
    private readonly config: SidecarClientConfig,
    private readonly identity: ReleaseIdentity,
    private readonly defaultTimeoutMs = DEFAULT_REQUEST_DEADLINE_MS,
  ) {
    this.endpoint = parseEndpoint(config.url);
    const ca = trustedAuthorities(config.caCertificate);
    this.secureContext = ca.length > 0 ? createSecureContext({ ca }) : undefined;
  }

  get secure(): boolean {
    return this.endpoint.secure;
  }

  /** Aborts every request in flight. */
  close(): void {
    this.lifecycle.abort();
  }

  /** The headers for a versioned request or the event-stream upgrade. */
  headers(correlationId: string, deadlineMs?: number): Record<string, string> {
    return buildRequestHeaders({ ...this.identity, correlationId, deadlineMs, token: this.config.token });
  }

  /** Options for `https.request` and the WebSocket: the trust store with the administrator's CA, when one is set. */
  get tlsOptions(): { secureContext?: SecureContext } {
    return this.secureContext ? { secureContext: this.secureContext } : {};
  }

  /** `GET /version`: needs the token but no release headers. */
  version(): Promise<OperationResponse<'health.version'>> {
    return this.call('health.version');
  }

  /** `GET /v1/capabilities`: the first request that goes through the release-compatibility check. */
  capabilities(options: CallOptions<'health.capabilities'> = {}): Promise<OperationResponse<'health.capabilities'>> {
    return this.call('health.capabilities', options);
  }

  /** Performs one contract operation and returns the response, validated against the contract schema. */
  async call<Id extends OperationId>(
    operationId: Id,
    options: CallOptions<Id> = {} as CallOptions<Id>,
  ): Promise<OperationResponse<Id>> {
    const operation = OPERATIONS.find((candidate) => candidate.id === operationId);
    if (!operation) throw new SidecarRequestError(`Unknown operation ${operationId}.`);
    const params = this.checkedParams(operation.params, options.params as Record<string, string> | undefined);
    const path = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
      encodeURIComponent(params[name] ?? ''),
    );
    let payload: string | undefined;
    if (operation.body) {
      const checked = operation.body.safeParse(options.body);
      if (!checked.success)
        throw new SidecarRequestError('The request does not match the contract.', { code: 'validation_failed' });
      payload = JSON.stringify(checked.data);
    }
    const raw = await this.send(operation.method, path, payload, options, operation.physical === true);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new SidecarRequestError('The Matter sidecar answered with something that is not JSON.', {
        code: 'invalid_response',
      });
    }
    const checked = operation.response.safeParse(json);
    if (!checked.success) {
      throw new SidecarRequestError('The Matter sidecar answered with a response that violates the contract.', {
        code: 'invalid_response',
      });
    }
    return checked.data as OperationResponse<Id>;
  }

  private checkedParams(schema: z.ZodType | undefined, params: Record<string, string> = {}): Record<string, string> {
    if (!schema) return params;
    const checked = schema.safeParse(params);
    if (!checked.success) throw new SidecarRequestError('Invalid path parameters.', { code: 'validation_failed' });
    return checked.data as Record<string, string>;
  }

  private send(method: string, path: string, payload: string | undefined, options: RequestControl, physical: boolean) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const correlationId = options.correlationId ?? randomUUID();
    const headers: Record<string, string> = this.headers(correlationId, timeoutMs);
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    const signals = [this.lifecycle.signal, ...(options.signal ? [options.signal] : [])];
    const signal = AbortSignal.any(signals);
    if (signal.aborted) return Promise.reject(new SidecarAbortedError(undefined, { correlationId }));
    const send = this.endpoint.secure ? httpsRequest : httpRequest;
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      // Once the connection is up the request may have reached the sidecar: from then on, a failed physical
      // operation has an unknown effect on the device. Refused, unresolvable or unroutable hosts never got it.
      let connected = false;
      const uncertain = () => physical && connected;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        action();
      };
      const networkFailure = (error: unknown) =>
        classifyNetworkError(error, correlationId, uncertain() ? 'uncertain' : undefined);
      const req = send(
        `${this.endpoint.origin}${this.endpoint.prefix}${path}`,
        { method, headers, agent: false, ...this.tlsOptions },
        (res) => {
          readLimited(res, MAX_MESSAGE_BYTES).then(
            (text) => {
              const status = res.statusCode ?? 0;
              if (status >= 200 && status < 300) return finish(() => resolve(text));
              const header = res.headers[HEADER_CORRELATION_ID];
              finish(() =>
                reject(
                  classifyHttpFailure(
                    status,
                    text,
                    typeof header === 'string' ? header : null,
                    physical ? 'uncertain' : undefined,
                  ),
                ),
              );
            },
            (error) => finish(() => reject(error instanceof SidecarClientError ? error : networkFailure(error))),
          );
        },
      );
      req.on('socket', (socket) => {
        socket.once(this.endpoint.secure ? 'secureConnect' : 'connect', () => (connected = true));
      });
      const onAbort = () => {
        req.destroy();
        finish(() =>
          reject(
            uncertain()
              ? new SidecarAbortedError(`The request was cancelled after it was sent. ${UNCERTAIN_HINT}`, {
                  correlationId,
                  outcome: 'uncertain',
                })
              : new SidecarAbortedError(undefined, { correlationId }),
          ),
        );
      };
      const timer = setTimeout(() => {
        req.destroy();
        finish(() =>
          reject(
            new SidecarTimeoutError(physical ? `The request timed out. ${UNCERTAIN_HINT}` : 'The request timed out.', {
              correlationId,
              ...(physical ? { outcome: 'uncertain' as const } : {}),
            }),
          ),
        );
      }, timeoutMs + LOCAL_TIMEOUT_GRACE_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('error', (error) => finish(() => reject(networkFailure(error))));
      req.end(payload);
    });
  }
}
