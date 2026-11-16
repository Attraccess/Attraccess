import { Logger } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { buildRestRequest, McpArgumentError, RestRequest } from './mcp-rest-bridge';
import type { McpTool } from './openapi-tools';

export interface McpToolSource {
  list(): McpTool[];
  get(name: string): McpTool | undefined;
}

/** A fresh server per HTTP request (stateless Streamable HTTP): `tools` capability only. */
export function createMcpServer(
  tools: McpToolSource,
  execute: (request: RestRequest) => Promise<CallToolResult>,
  version: string,
): Server {
  const server = new Server(
    { name: 'attraccess', version },
    {
      capabilities: { tools: {} },
      instructions:
        'Attraccess machine and access management. Each tool is one REST operation and fails exactly as the REST ' +
        'API would for your credentials; permission errors are reported as tool errors.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.list().map((tool) => ({
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
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
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
