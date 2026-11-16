import { Injectable, Logger } from '@nestjs/common';
import reviewedManifest from './reviewed-manifest.json';
import { analyzeMcpManifest, McpManifestEntry, McpTool, OpenApiDocument } from './openapi-tools';

/**
 * The MCP tools of this process: generated once, lazily, from the live OpenAPI document and the reviewed manifest.
 * At runtime drift never stops the server; unknown, changed or plugin operations are simply not exposed
 * (CI's drift test is what makes a developer review them).
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

  list(): McpTool[] {
    return [...this.load().values()];
  }

  get(name: string): McpTool | undefined {
    return this.load().get(name);
  }

  private load(): Map<string, McpTool> {
    if (this.tools) return this.tools;
    const tools = new Map<string, McpTool>();
    if (!this.documentFactory) {
      this.logger.warn('No OpenAPI document is available; the MCP server exposes no tools');
      return (this.tools = tools);
    }
    try {
      const { tools: generated, problems } = analyzeMcpManifest(
        this.documentFactory(),
        reviewedManifest as Record<string, McpManifestEntry>,
      );
      for (const tool of generated) tools.set(tool.name, tool);
      if (problems.length) {
        // Plugin operations always land here: they are not part of the reviewed host manifest.
        this.logger.warn(
          `${problems.length} OpenAPI operation(s) are not exposed as MCP tools (unreviewed, changed or incompatible): ` +
            problems
              .slice(0, 10)
              .map((problem) => `${problem.operationId ?? `${problem.method} ${problem.path}`} [${problem.kind}]`)
              .join(', ') +
            (problems.length > 10 ? ', ...' : ''),
        );
      }
      this.logger.log(`Exposing ${tools.size} MCP tools`);
    } catch (error) {
      this.logger.error(`Could not generate MCP tools: ${(error as Error).message}`);
    }
    return (this.tools = tools);
  }
}
