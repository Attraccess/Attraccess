import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tool } from 'ai';
import { z } from 'zod';
import { OpenAPIObject } from '@nestjs/swagger';
import { AppConfigType } from '../../config/app.config';
import { SettingsService } from '../../settings/settings.service';
import { RagService } from '../rag/rag.service';
import { OpenApiEndpointIndex, EndpointInfo } from './openapi-tools';

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly fallbackUrl: string;
  private endpointIndex: OpenApiEndpointIndex | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly ragService: RagService,
  ) {
    this.fallbackUrl = this.configService.get<AppConfigType>('app')?.ATTRACCESS_URL || 'http://localhost:3000';
  }

  setOpenApiDocument(doc: OpenAPIObject) {
    this.endpointIndex = new OpenApiEndpointIndex(doc);
    this.logger.log(`Indexed ${this.endpointIndex.getAllEndpoints().length} API endpoints for AI tools`);
  }

  private async resolveAppUrl(): Promise<string> {
    return (await this.settingsService.getUrl()) || this.fallbackUrl;
  }

  buildTools(sessionCookie: string): Record<string, unknown> {
    const tools: Record<string, unknown> = {};

    tools['searchEndpoints'] = (tool as any)({
      description: 'Search for available API endpoints by keyword or intent. Use this to discover what API operations are available before calling them. Returns matching endpoints with their method, path, parameters, and description.',
      parameters: z.object({
        query: z.string().describe('Search query to find relevant API endpoints, e.g. "list resources", "billing", "create project"'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q']);
        this.logger.log(`Tool searchEndpoints: query="${query}" rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: 'Missing required parameter "query". Please provide a search query string.' };
        }
        const result = this.handleSearchEndpoints(query);
        this.logger.log(`Tool searchEndpoints: found ${'endpoints' in result ? result.endpoints.length : 0} endpoints`);
        return result;
      },
    });

    tools['callEndpoint'] = (tool as any)({
      description: 'Call any API endpoint. First use searchEndpoints to find the right endpoint, then use this to execute it. Path parameters should be substituted directly in the path (e.g. /api/resources/5 not /api/resources/{id}).',
      parameters: z.object({
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
        path: z.string().describe('API path with parameters already substituted, e.g. /api/resources/5'),
        body: z.record(z.string(), z.unknown()).optional().describe('Request body for POST/PUT/PATCH requests'),
        query: z.record(z.string(), z.string()).optional().describe('Query string parameters'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const method = (args.method as string) || 'GET';
        const path = (args.path as string) || '';
        this.logger.log(`Tool callEndpoint: ${method} ${path} rawArgs=${JSON.stringify(args)}`);
        if (!path) {
          return { success: false, error: 'Missing required parameter "path". Provide the API path to call.' };
        }
        const result = await this.handleCallEndpoint(
          { method, path, body: args.body as Record<string, unknown>, query: args.query as Record<string, string> },
          sessionCookie,
        );
        this.logger.log(`Tool callEndpoint: ${method} ${path} -> ${result.success ? 'OK' : 'FAIL'} status=${result.status ?? 'N/A'}${result.error ? ` error="${result.error}"` : ''}`);
        return result;
      },
    });

    tools['searchDocs'] = (tool as any)({
      description: 'Full-text search through the Attraccess documentation markdown files. Use this to find specific terms or keywords in the docs. Returns matching text with surrounding context and file path.',
      parameters: z.object({
        query: z.string().describe('Text to search for in the documentation'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default: 10)'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q', 'text']);
        this.logger.log(`Tool searchDocs: query="${query}" rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: 'Missing required parameter "query". Please provide text to search for.' };
        }
        return this.ragService.textSearch(query, (args.maxResults as number) || undefined);
      },
    });

    tools['searchDocumentation'] = (tool as any)({
      description: 'Semantic search through Attraccess documentation using embeddings. Use this to find documentation relevant to a topic or question by meaning, not just exact keywords. Returns the most relevant documentation chunks with their source file.',
      parameters: z.object({
        query: z.string().describe('Natural language query describing what you want to find, e.g. "how to set up SSO" or "resource permissions"'),
        maxResults: z.number().optional().describe('Maximum number of results to return (default: 5)'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q', 'text']);
        this.logger.log(`Tool searchDocumentation: query="${query}" indexed=${this.ragService.isIndexed} rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: 'Missing required parameter "query". Please provide a search query.' };
        }
        if (!this.ragService.isIndexed) {
          return { error: 'Documentation index not available. RAG indexing may still be in progress or Ollama is not reachable.' };
        }
        return this.ragService.search(query, (args.maxResults as number) || 5);
      },
    });

    this.logger.debug(`Built ${Object.keys(tools).length} AI tools`);
    return tools;
  }

  private extractStringArg(args: Record<string, unknown>, primary: string, fallbacks: string[]): string | undefined {
    if (typeof args[primary] === 'string' && args[primary]) return args[primary] as string;
    for (const key of fallbacks) {
      if (typeof args[key] === 'string' && args[key]) {
        this.logger.warn(`Tool arg fixup: model sent "${key}" instead of "${primary}", accepting it`);
        return args[key] as string;
      }
    }
    return undefined;
  }

  private handleSearchEndpoints(query: string): { endpoints: EndpointInfo[] } | { error: string } {
    if (!this.endpointIndex) {
      return { error: 'OpenAPI spec not loaded yet. API endpoint search is not available.' };
    }

    const results = this.endpointIndex.search(query);

    if (results.length === 0) {
      return { endpoints: [], error: `No endpoints found matching "${query}". Try different keywords.` } as any;
    }

    return { endpoints: results };
  }

  private async handleCallEndpoint(
    args: { method: string; path: string; body?: Record<string, unknown>; query?: Record<string, string> },
    sessionCookie: string,
  ): Promise<{ success: boolean; status?: number; data?: unknown; error?: string }> {
    const appUrl = await this.resolveAppUrl();
    let url = `${appUrl}${args.path}`;

    if (args.query && Object.keys(args.query).length > 0) {
      const params = new URLSearchParams(args.query);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json', Cookie: sessionCookie };

    try {
      const fetchOptions: RequestInit = { method: args.method, headers };

      if (args.body && ['POST', 'PUT', 'PATCH'].includes(args.method)) {
        fetchOptions.body = JSON.stringify(args.body);
      }

      const res = await fetch(url, fetchOptions);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return { success: false, status: res.status, error: `API returned ${res.status}: ${JSON.stringify(data)}` };
      }

      return { success: true, status: res.status, data };
    } catch (err) {
      this.logger.error(`Tool callEndpoint failed for ${args.method} ${args.path}`, err);
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Request failed: ${message}` };
    }
  }
}
