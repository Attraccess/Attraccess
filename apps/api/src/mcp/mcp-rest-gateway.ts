import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, RequestListener, Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpDelegation, setMcpDelegation } from './mcp-delegation';
import { formatRestResponse, RestRequest } from './mcp-rest-bridge';

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
    this.starting ??= this.listen();
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
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
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
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('error', reject);
          incoming.on('end', () =>
            resolve({
              status: incoming.statusCode ?? 502,
              contentType: incoming.headers['content-type'],
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      outgoing.on('timeout', () => outgoing.destroy(new Error('The REST request timed out')));
      outgoing.on('error', reject);
      outgoing.end(payload);
    });
  }
}
