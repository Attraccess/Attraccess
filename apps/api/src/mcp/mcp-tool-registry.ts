import { Injectable, Logger } from '@nestjs/common';
import { mcpToolAllowed } from '@attraccess/shared';
import { generateMcpTools, McpTool, OpenApiDocument } from './openapi-tools';

/** The tools whose requirement the permissions satisfy. */
export function toolsFor(tools: Iterable<McpTool>, permissions: ReadonlySet<string>): McpTool[] {
  return [...tools].filter((tool) => mcpToolAllowed(tool.auth, permissions));
}

/**
 * The MCP tools of this process: generated once, lazily, from the live OpenAPI document by rule (see
 * `openapi-tools.ts`). Plugin operations are included; the cache is not refreshed when plugins change at runtime.
 */
@Injectable()
export class McpToolRegistry {
  private readonly logger = new Logger(McpToolRegistry.name);
  private documentFactory?: () => OpenApiDocument;
  private tools?: Map<string, McpTool>;

  setDocumentFactory(factory: () => OpenApiDocument): void {
    this.documentFactory = factory;
    this.tools = undefined;
  }

  /** Every tool, whatever the caller may use. */
  list(): McpTool[] {
    return [...this.load().values()];
  }

  /** Any tool by name, whatever the caller may use. */
  get(name: string): McpTool | undefined {
    return this.load().get(name);
  }

  /** The tools a caller with these effective permissions may see and call. */
  toolsFor(permissions: ReadonlySet<string>): McpTool[] {
    return toolsFor(this.load().values(), permissions);
  }

  private load(): Map<string, McpTool> {
    if (this.tools) return this.tools;
    const tools = new Map<string, McpTool>();
    if (!this.documentFactory) {
      this.logger.warn('No OpenAPI document is available; the MCP server exposes no tools');
      return (this.tools = tools);
    }
    try {
      const { tools: generated, skipped } = generateMcpTools(this.documentFactory());
      for (const tool of generated) tools.set(tool.name, tool);
      const duplicates = skipped.filter((entry) => entry.reason.startsWith('Duplicate operationId'));
      if (duplicates.length) {
        this.logger.log(
          `Skipped ${duplicates.length} operation(s) with a duplicate operationId: ` +
            duplicates.map((entry) => `${entry.operationId} (${entry.method} ${entry.path})`).join(', '),
        );
      }
      this.logger.debug(`${skipped.length} OpenAPI operation(s) are not MCP tools`);
      this.logger.log(`Exposing ${tools.size} MCP tools (${skipped.length} operations skipped)`);
    } catch (error) {
      this.logger.error(`Could not generate MCP tools: ${(error as Error).message}`);
    }
    return (this.tools = tools);
  }
}
