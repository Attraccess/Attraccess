import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, RequestListener, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpDelegation, setMcpDelegation } from '../users-and-auth/strategies/mcp-delegation';
import { formatRestResponse, MAX_RESULT_CHARS, RestRequest } from './mcp-rest-bridge';

export type CallerContext = {
  /** The bearer token of an API-token caller; the only credential ever forwarded. */
  authorization?: string;
  /** Set for MCP OAuth callers; travels in-process, never as a header. */
  delegation?: McpDelegation;
  ip: string;
  userAgent?: string;
  host?: string;
};

const CALL_HEADER = 'x-mcp-call';
const REQUEST_TIMEOUT_MS = 60_000;
/** Enough bytes for MAX_RESULT_CHARS characters of any UTF-8 text; the rest of a larger response is not read. */
const MAX_RESPONSE_BYTES = 4 * MAX_RESULT_CHARS + 4;

class RestTimeoutError extends Error {}

/**
 * Runs a tool call through the real Nest pipeline (guards, pipes, interceptors, filters) as the same client.
 *
 * The call goes to a private HTTP server on a local socket that hands requests to the very same Express
 * application. The caller's IP and user agent are attributed to the request, and an OAuth principal is attached to
 * the request object in memory. The socket is not reachable from the network and carries no credentials: a local
 * process that connects to it is just an anonymous REST client, because the principal is only attached for calls
 * that present a one-time nonce known to this process.
 */
@Injectable()
export class McpRestGateway implements OnApplicationShutdown {
  private readonly logger = new Logger(McpRestGateway.name);
  private readonly pending = new Map<string, CallerContext>();
  private starting?: Promise<{ server: Server; socketPath: string; directory?: string }>;

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  async execute(restRequest: RestRequest, caller: CallerContext): Promise<CallToolResult> {
    const { socketPath } = await this.start();
    const nonce = randomBytes(24).toString('base64url');
    this.pending.set(nonce, caller);
    try {
      const response = await this.send(socketPath, nonce, restRequest, caller);
      return formatRestResponse(response.status, response.contentType, response.body);
    } catch (error) {
      if (!(error instanceof RestTimeoutError)) throw error;
      // The REST handler may still finish: say so, so that a client does not blindly repeat a write.
      const seconds = REQUEST_TIMEOUT_MS / 1000;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `HTTP 504 Gateway Timeout: no response within ${seconds} s. The operation may still complete; check its result before you retry.`,
          },
        ],
      };
    } finally {
      this.pending.delete(nonce);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const started = await this.starting?.catch(() => undefined);
    if (!started) return;
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
    if (started.directory) rmSync(started.directory, { recursive: true, force: true });
  }

  private start() {
    // A failed start (e.g. no writable temporary directory) is retried by the next call instead of being cached.
    this.starting ??= this.listen().catch((error: unknown) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }

  private async listen() {
    const app = this.adapterHost.httpAdapter.getInstance() as RequestListener;
    const server = createServer((req, res) => {
      const nonce = req.headers[CALL_HEADER];
      delete req.headers[CALL_HEADER];
      const caller = typeof nonce === 'string' ? this.pending.get(nonce) : undefined;
      if (caller) {
        if (caller.delegation) setMcpDelegation(req, caller.delegation);
        // Audit and rate limiting must see the real client, not the private socket.
        Object.defineProperty(req, 'ip', { value: caller.ip, configurable: true });
        Object.defineProperty(req.socket, 'remoteAddress', { value: caller.ip, configurable: true });
      }
      app(req, res);
    });
    server.keepAliveTimeout = 1;
    let directory: string | undefined;
    let socketPath: string;
    if (process.platform === 'win32') {
      socketPath = `\\\\.\\pipe\\attraccess-mcp-${process.pid}-${randomBytes(6).toString('hex')}`;
    } else {
      directory = mkdtempSync(join(tmpdir(), 'attraccess-mcp-'));
      socketPath = join(directory, 'rest.sock');
    }
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
    } catch (error) {
      if (directory) rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    this.logger.log('MCP REST gateway listening on a private local socket');
    return { server, socketPath, directory };
  }

  private send(
    socketPath: string,
    nonce: string,
    restRequest: RestRequest,
    caller: CallerContext,
  ): Promise<{ status: number; contentType: string | undefined; body: string }> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      // After a timeout the response stream may fail with Node's own "aborted" error first: report the timeout.
      const fail = (error: Error) => reject(timedOut ? new RestTimeoutError('The REST request timed out') : error);
      const payload = restRequest.body === undefined ? undefined : Buffer.from(JSON.stringify(restRequest.body));
      const headers: Record<string, string> = {
        accept: 'application/json',
        connection: 'close',
        [CALL_HEADER]: nonce,
      };
      if (caller.userAgent) headers['user-agent'] = caller.userAgent;
      if (caller.host) headers.host = caller.host;
      // An API token is already the caller's own credential, so SessionStrategy authenticates it as for plain REST.
      if (caller.authorization) headers.authorization = caller.authorization;
      if (payload) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(payload.length);
      }
      const outgoing = httpRequest(
        {
          socketPath,
          path: restRequest.url,
          method: restRequest.method,
          headers,
          agent: false,
          timeout: REQUEST_TIMEOUT_MS,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          let size = 0;
          const finish = () =>
            resolve({
              status: incoming.statusCode ?? 502,
              contentType: incoming.headers['content-type'],
              body: Buffer.concat(chunks).toString('utf8'),
            });
          incoming.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            size += chunk.length;
            // More than a tool result can carry: stop reading instead of buffering the whole response.
            if (size >= MAX_RESPONSE_BYTES) {
              incoming.removeAllListeners('data');
              incoming.destroy();
              finish();
            }
          });
          incoming.on('error', fail);
          incoming.on('end', finish);
        },
      );
      outgoing.on('timeout', () => {
        timedOut = true;
        outgoing.destroy(new RestTimeoutError('The REST request timed out'));
      });
      outgoing.on('error', fail);
      outgoing.end(payload);
    });
  }
}
