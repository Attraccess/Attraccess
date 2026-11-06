import {
  DEFAULT_REQUEST_DEADLINE_MS,
  HEADER_CORRELATION_ID,
  MAX_MESSAGE_BYTES,
  OPERATIONS,
  buildRequestHeaders,
  versionResponseSchema,
  type CapabilityReport,
  type OperationId,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { rootCertificates } from 'node:tls';
import type { z } from 'zod';
import {
  SidecarAbortedError,
  SidecarClientError,
  SidecarRequestError,
  SidecarTimeoutError,
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

export type CallOptions = {
  params?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  correlationId?: string;
};

/** The sidecar answers a request that outlived its deadline itself; the client gives up a little later. */
const LOCAL_TIMEOUT_GRACE_MS = 1_000;

/** TLS trust: Node's bundled roots plus the administrator's CA. Verification is never turned off. */
export function trustedAuthorities(caCertificate?: string | null): string[] {
  return caCertificate ? [...rootCertificates, caCertificate] : [];
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

  constructor(
    private readonly config: SidecarClientConfig,
    private readonly identity: ReleaseIdentity,
    private readonly defaultTimeoutMs = DEFAULT_REQUEST_DEADLINE_MS,
  ) {
    this.endpoint = parseEndpoint(config.url);
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

  get tlsOptions(): { ca?: string[] } {
    const ca = trustedAuthorities(this.config.caCertificate);
    return ca.length > 0 ? { ca } : {};
  }

  /** `GET /version`: needs the token but no release headers. */
  async version() {
    return (await this.call('health.version')) as z.infer<typeof versionResponseSchema>;
  }

  /** `GET /v1/capabilities`: the first request that goes through the release-compatibility check. */
  async capabilities(options: CallOptions = {}) {
    return (await this.call('health.capabilities', options)) as CapabilityReport;
  }

  /** Performs one contract operation and returns the response, validated against the contract schema. */
  async call(operationId: OperationId, options: CallOptions = {}): Promise<unknown> {
    const operation = OPERATIONS.find((candidate) => candidate.id === operationId);
    if (!operation) throw new SidecarRequestError(`Unknown operation ${operationId}.`);
    const params = this.checkedParams(operation.params, options.params);
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
    return checked.data;
  }

  private checkedParams(schema: z.ZodType | undefined, params: Record<string, string> = {}): Record<string, string> {
    if (!schema) return params;
    const checked = schema.safeParse(params);
    if (!checked.success) throw new SidecarRequestError('Invalid path parameters.', { code: 'validation_failed' });
    return checked.data as Record<string, string>;
  }

  private send(method: string, path: string, payload: string | undefined, options: CallOptions, physical: boolean) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const correlationId = options.correlationId ?? randomUUID();
    const headers: Record<string, string> = this.headers(correlationId, timeoutMs);
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    const signals = [this.lifecycle.signal, ...(options.signal ? [options.signal] : [])];
    const signal = AbortSignal.any(signals);
    if (signal.aborted) return Promise.reject(new SidecarAbortedError());
    const send = this.endpoint.secure ? httpsRequest : httpRequest;
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        action();
      };
      const req = send(
        `${this.endpoint.origin}${this.endpoint.prefix}${path}`,
        { method, headers, agent: false, ...this.tlsOptions },
        (res) => {
          readLimited(res, MAX_MESSAGE_BYTES).then(
            (text) => {
              const status = res.statusCode ?? 0;
              if (status >= 200 && status < 300) return finish(() => resolve(text));
              const header = res.headers[HEADER_CORRELATION_ID];
              finish(() => reject(classifyHttpFailure(status, text, typeof header === 'string' ? header : null)));
            },
            (error) => finish(() => reject(error instanceof SidecarClientError ? error : classifyNetworkError(error))),
          );
        },
      );
      const onAbort = () => {
        req.destroy();
        finish(() => reject(new SidecarAbortedError()));
      };
      const timer = setTimeout(() => {
        req.destroy();
        finish(() =>
          reject(
            new SidecarTimeoutError(
              physical
                ? 'The request timed out. The effect on the device is uncertain; do not retry automatically.'
                : 'The request timed out.',
              { correlationId, ...(physical ? { outcome: 'uncertain' as const } : {}) },
            ),
          ),
        );
      }, timeoutMs + LOCAL_TIMEOUT_GRACE_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('error', (error) => finish(() => reject(classifyNetworkError(error))));
      req.end(payload);
    });
  }
}
