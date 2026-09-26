import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generateMcpTools, McpManifestEntry, OpenApiDocument } from './openapi-tools';
import reviewedManifest from './reviewed-manifest.json';
import { mcpOAuthAuthorizationServerMetadata } from './mcp-oauth';
import { signMcpDelegation } from './mcp-delegation';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type AuthenticatedRequest = Request & {
  user?: { id: number; effectivePermissions?: Set<string> };
  mcpOAuth?: boolean;
  mcpApplicationToken?: string;
};

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function getBearerToken(request: Request): string | undefined {
  const value = request.header('authorization');
  const match = value?.match(/^Bearer[ \t]+([^\s]+)[ \t]*$/i);
  return match?.[1]?.trim();
}

function materializeToolUrl(tool: ReturnType<typeof generateMcpTools>[number], args: Record<string, unknown>): URL {
  const path = tool.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    if (!(name in args)) throw new Error(`Missing required path input ${name}`);
    return encodeURIComponent(String(args[name]));
  });
  const url = new URL(path, 'http://localhost');
  for (const name of tool.queryParameters) {
    const value = args[name];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) for (const item of value) url.searchParams.append(name, String(item));
      else url.searchParams.set(name, String(value));
    }
  }
  return url;
}

function validateToolArguments(tool: ReturnType<typeof generateMcpTools>[number], value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object');
  const args = value as Record<string, unknown>;
  const required = tool.inputSchema.required ?? [];
  for (const name of required) if (!(name in args)) throw new Error(`Missing required input ${name}`);
  for (const name of Object.keys(args)) {
    if (!Object.prototype.hasOwnProperty.call(tool.inputSchema.properties, name)) throw new Error(`Unknown input ${name}`);
  }
  return args;
}

async function invokeRestTool(
  tool: ReturnType<typeof generateMcpTools>[number],
  args: Record<string, unknown>,
  request: AuthenticatedRequest,
  port: number,
  delegationSecret: string,
): Promise<unknown> {
  const url = materializeToolUrl(tool, args);
  // Swagger's exported paths already contain Nest's configured global prefix.
  const forwardedPath = `${url.pathname}${url.search}`;
  const headers = new Headers({ accept: 'application/json' });
  const bearer = getBearerToken(request);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  const cookie = request.header('cookie');
  if (cookie) headers.set('cookie', cookie);
  if (request.mcpOAuth && request.user?.effectivePermissions) {
    headers.set('x-mcp-delegation', signMcpDelegation(delegationSecret, {
      userId: request.user.id,
      permissions: [...request.user.effectivePermissions],
      expiresAt: Date.now() + 60_000,
    }));
  } else {
    const delegation = request.header('x-mcp-delegation');
    if (delegation) headers.set('x-mcp-delegation', delegation);
  }

  const body: Record<string, unknown> = {};
  let hasBody = false;
  for (const property of tool.bodyProperties) {
    if (property === 'body') {
      headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${forwardedPath}`, {
        method: tool.method,
        headers,
        body: JSON.stringify(args.body),
      });
      return readRestResponse(response);
    }
    if (Object.prototype.hasOwnProperty.call(args, property)) {
      body[property] = args[property];
      hasBody = true;
    }
  }
  const queryNames = new Set(tool.queryParameters);
  for (const [key, value] of Object.entries(args)) {
    if (tool.pathParameters.includes(key) || queryNames.has(key)) continue;
    body[key] = value;
    hasBody = true;
  }
  if (hasBody) headers.set('content-type', 'application/json');
  const response = await fetch(`http://127.0.0.1:${port}${forwardedPath}`, {
    method: tool.method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  return readRestResponse(response);
}

async function readRestResponse(response: globalThis.Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  let data: unknown = text;
  if (contentType.includes('json') && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : String(data);
    throw new Error(`REST ${response.status}: ${message}`);
  }
  return data;
}

/** Registers the stateless JSON-RPC MCP HTTP transport over reviewed OpenAPI tools. */
export function registerMcpHttpEndpoints(
  app: NestExpressApplication,
  options: {
    document: OpenApiDocument;
    authenticate: (request: AuthenticatedRequest) => Promise<void>;
    resourceUrl: string;
    port: number;
    globalPrefix: string;
    delegationSecret: string;
    manifest?: Record<string, McpManifestEntry>;
  },
): void {
  const tools = generateMcpTools(options.document, options.manifest ?? (reviewedManifest as Record<string, McpManifestEntry>));
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const router = Router();
  const mcpRateLimit = rateLimit({ max: 120, windowMs: 60_000, standardHeaders: true });
  const metadataRouter = Router();
  const issuer = new URL('/', options.resourceUrl).origin;
  const oauthPrefix = `${options.globalPrefix ? `/${options.globalPrefix}` : ''}/mcp`;
  const metadata = (_request: Request, response: Response) => {
    response.json({ resource: options.resourceUrl, authorization_servers: [issuer] });
  };
  metadataRouter.get('/', metadata);
  metadataRouter.get('/api/mcp', metadata);
  app.use(RESOURCE_METADATA_PATH, metadataRouter);
  const authorizationServerMetadata = Router();
  authorizationServerMetadata.get('/', (_request, response) => response.json(mcpOAuthAuthorizationServerMetadata(issuer, oauthPrefix)));
  app.use('/.well-known/oauth-authorization-server', authorizationServerMetadata);

  router.get('/', (_request, response) => response.sendStatus(405));
  router.post('/', mcpRateLimit, async (request: AuthenticatedRequest, response: Response) => {
    const rpc = request.body as JsonRpcRequest;
    if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      response.status(400).json(rpcError(rpc?.id, -32600, 'Invalid JSON-RPC request'));
      return;
    }
    if (rpc.method === 'notifications/initialized') {
      response.sendStatus(202);
      return;
    }
    try {
      if (!getBearerToken(request)) throw new Error('Bearer authentication is required');
      await options.authenticate(request);
    } catch {
      response.setHeader('WWW-Authenticate', `Bearer resource_metadata="${options.resourceUrl.replace(/\/mcp\/?$/, '')}${RESOURCE_METADATA_PATH}/api/mcp"`);
      response.status(401).json(rpcError(rpc.id, -32001, 'Unauthorized'));
      return;
    }

    if (rpc.method === 'initialize') {
      response.json({
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        result: {
          protocolVersion: typeof rpc.params?.protocolVersion === 'string' ? rpc.params.protocolVersion : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'attraccess-openapi-mcp', version: '1.0.0' },
        },
      });
      return;
    }
    if (rpc.method === 'tools/list') {
      response.json({ jsonrpc: '2.0', id: rpc.id ?? null, result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
      return;
    }
    if (rpc.method === 'tools/call') {
      const name = rpc.params?.name;
      const tool = typeof name === 'string' ? toolsByName.get(name) : undefined;
      if (!tool) {
        response.json(rpcError(rpc.id, -32602, `Unknown tool ${String(name)}`));
        return;
      }
      try {
        const args = validateToolArguments(tool, rpc.params?.arguments);
        const value = await invokeRestTool(tool, args, request, options.port, options.delegationSecret);
        response.json({ jsonrpc: '2.0', id: rpc.id ?? null, result: { content: [{ type: 'text', text: JSON.stringify(value ?? null) }], isError: false } });
      } catch (error) {
        response.json({ jsonrpc: '2.0', id: rpc.id ?? null, result: { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool invocation failed' }], isError: true } });
      }
      return;
    }
    if (rpc.method.startsWith('notifications/')) {
      response.sendStatus(202);
      return;
    }
    response.json(rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`));
  });
  app.use(`${options.globalPrefix ? `/${options.globalPrefix}` : ''}/mcp`, router);
}
