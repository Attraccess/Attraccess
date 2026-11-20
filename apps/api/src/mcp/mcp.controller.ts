import { All, Controller, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import type { AppConfigType } from '../config/app.config';
import { SkipApiTokenRequestLimit } from '../users-and-auth/auth/api-token/api-token-request-rate-limit.interceptor';
import { resolveIp } from '../users-and-auth/rate-limiting/login.rate-limit.guard';
import { McpBearerGuard } from './mcp-bearer.guard';
import { getMcpDelegation } from '../users-and-auth/strategies/mcp-delegation';
import { McpRateLimit, McpRateLimitGuard } from './mcp-rate-limit.guard';
import { McpRestGateway } from './mcp-rest-gateway';
import { createMcpServer } from './mcp-server';
import { McpToolRegistry } from './mcp-tool-registry';

/** True when the JSON-RPC body (one message or a batch) contains a tool call, which runs as its own REST request. */
function containsToolCall(body: unknown): boolean {
  const messages: unknown[] = Array.isArray(body) ? body : [body];
  return messages.some((message) => (message as { method?: unknown } | null)?.method === 'tools/call');
}

/** The MCP endpoint: stateless Streamable HTTP, `tools` only, authenticated by a bearer token. */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly registry: McpToolRegistry,
    private readonly gateway: McpRestGateway,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @McpRateLimit('mcp')
  // Each tool call is charged against the API token by the REST request that executes it; anything else is charged here.
  @SkipApiTokenRequestLimit((request) => containsToolCall(request.body))
  @UseGuards(McpRateLimitGuard, McpBearerGuard)
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const delegation = getMcpDelegation(req);
    const caller = {
      authorization: delegation ? undefined : req.headers.authorization,
      delegation,
      ip: resolveIp(req),
      userAgent: req.headers['user-agent'],
      host: req.headers.host,
    };
    const server = createMcpServer(
      this.registry,
      (restRequest) => this.gateway.execute(restRequest, caller),
      this.config.get<AppConfigType>('app')?.VERSION ?? '0.0.0',
    );
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(`MCP request failed: ${(error as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  }

  /** There is no server-to-client stream (tools only), so GET and DELETE are not offered. */
  @All()
  methodNotAllowed(@Res() res: Response): void {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  }
}
