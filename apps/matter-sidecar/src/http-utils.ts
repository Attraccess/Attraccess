import { HEADER_CORRELATION_ID, buildError, type ErrorCode, ERROR_STATUS } from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function correlationIdFrom(headers: IncomingHttpHeaders): string {
  const value = headers[HEADER_CORRELATION_ID];
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : randomUUID();
}

/**
 * The host name of a `Host` header, lowercase and without the port or a trailing dot, in the form
 * `normaliseAllowedHost` gives allow-list entries. An unbracketed value with several colons is not a valid Host and is
 * kept whole, so it matches nothing.
 */
export function hostnameOf(host: string | undefined): string | null {
  if (!host) return null;
  const lower = host.toLowerCase();
  let end = lower.length;
  if (lower.startsWith('[')) end = lower.indexOf(']') + 1 || end;
  else if (lower.indexOf(':') === lower.lastIndexOf(':') && lower.includes(':')) end = lower.indexOf(':');
  return lower.slice(0, end).replace(/\.$/, '');
}

/**
 * The sidecar is not a browser API: any Origin is refused, and so is any Host that is neither loopback nor on the
 * operator's allow-list. `allowedHosts` must hold normalised entries (see `normaliseAllowedHost`).
 */
export function checkLocalAccess(headers: IncomingHttpHeaders, allowedHosts: readonly string[] = []): string | null {
  if (headers.origin !== undefined) return 'Browser-origin requests are not accepted by the Matter sidecar.';
  const hostname = hostnameOf(headers.host);
  if (hostname === null) return 'The Matter sidecar needs a Host header.';
  // The allow-list entries are already normalised by loadConfig, so they are compared as they are.
  if (!ALLOWED_HOSTNAMES.has(hostname) && !allowedHosts.includes(hostname)) {
    return 'This Host name is not allowed. The operator must list it in MATTER_SIDECAR_ALLOWED_HOSTS.';
  }
  return null;
}

/** The request path, or null when the request target is not a valid URL path (such as `//`). Never throws. */
export function requestPath(url: string | undefined): string | null {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

export type ErrorReply = { code: ErrorCode; message: string; details?: Record<string, unknown>; outcome?: 'uncertain' };

export function errorBody(reply: ErrorReply, correlationId: string) {
  return buildError(reply.code, reply.message, correlationId, { details: reply.details, outcome: reply.outcome });
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  correlationId: string,
  close = false,
): void {
  if (res.headersSent || res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    [HEADER_CORRELATION_ID]: correlationId,
    'cache-control': 'no-store',
    ...(close ? { connection: 'close' } : {}),
  });
  res.end(payload);
}

export function sendError(res: ServerResponse, reply: ErrorReply, correlationId: string, close = false): void {
  sendJson(res, ERROR_STATUS[reply.code], errorBody(reply, correlationId), correlationId, close);
}

/**
 * Writes a raw HTTP error on a socket whose WebSocket upgrade is refused, then destroys it once flushed. A socket that
 * went through the upgrade event is no longer tracked by the HTTP server, so a peer that keeps its half open would
 * otherwise hold it forever and stall shutdown. Never throws.
 */
export function rejectUpgrade(socket: Duplex, reply: ErrorReply, correlationId: string): void {
  const payload = JSON.stringify(errorBody(reply, correlationId));
  const status = ERROR_STATUS[reply.code];
  socket.once('finish', () => socket.destroy());
  try {
    socket.end(
      `HTTP/1.1 ${status} ${reply.code}\r\ncontent-type: application/json; charset=utf-8\r\n` +
        `content-length: ${Buffer.byteLength(payload)}\r\n${HEADER_CORRELATION_ID}: ${correlationId}\r\n` +
        `cache-control: no-store\r\nconnection: close\r\n\r\n${payload}`,
    );
  } catch {
    socket.destroy();
  }
}

export class BodyTooLargeError extends Error {}

/** Reads at most `limit` bytes. Rejects with BodyTooLargeError as soon as the limit is exceeded. */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(new BodyTooLargeError());
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        reject(new BodyTooLargeError());
        return;
      }
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function safeIssues(error: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return error.issues.slice(0, 20).map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}
