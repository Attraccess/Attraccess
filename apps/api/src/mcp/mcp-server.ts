import { Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import { buildRestRequest, McpArgumentError, RestRequest } from './mcp-rest-bridge';
import { mcpToolAllowed } from '@attraccess/shared';
import type { McpTool } from './openapi-tools';

export interface McpToolSource {
  /** Every tool; `tools/call` checks the caller's permissions against the tool's requirement itself. */
  get(name: string): McpTool | undefined;
  toolsFor(permissions: ReadonlySet<string>): McpTool[];
}

// Building an Ajv instance costs far more than the rest of a server; one is enough for every request.
const jsonSchemaValidator = new AjvJsonSchemaValidator();

/** A fresh server per HTTP request (stateless Streamable HTTP): `tools` capability only. */
export function createMcpServer(
  tools: McpToolSource,
  execute: (request: RestRequest) => Promise<CallToolResult>,
  version: string,
  /** The caller's effective permissions (API token: token ∩ owner; OAuth: grant ∩ current). */
  permissions: ReadonlySet<string>,
): Server {
  const server = new Server(
    { name: 'attraccess', version },
    {
      capabilities: { tools: {} },
      jsonSchemaValidator,
      instructions:
        'Attraccess machine and access management. Each tool is one REST operation and fails exactly as the REST ' +
        'API would for your credentials; permission errors are reported as tool errors.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.toolsFor(permissions).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: tool.method === 'GET',
        destructiveHint: tool.method === 'DELETE',
        openWorldHint: false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const tool = tools.get(request.params.name);
    // A tool the caller cannot use is indistinguishable from one that does not exist.
    if (!tool || !mcpToolAllowed(tool.auth, permissions))
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    try {
      const restRequest = buildRestRequest(tool, (request.params.arguments ?? {}) as Record<string, unknown>);
      return await execute(restRequest);
    } catch (error) {
      if (error instanceof McpArgumentError) return { isError: true, content: [{ type: 'text', text: error.message }] };
      new Logger('McpServer').error(`Tool ${tool.name} failed: ${(error as Error).message}`);
      return { isError: true, content: [{ type: 'text', text: 'HTTP 500: the request could not be executed' }] };
    }
  });
  return server;
}
