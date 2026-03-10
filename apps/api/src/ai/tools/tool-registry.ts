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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools['searchEndpoints'] = (tool as any)({
      description: 'Search for API endpoints',
      parameters: z.object({
        query: z.string().describe('Keywords to find API endpoints'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q']);
        this.logger.log(`Tool searchEndpoints: query="${query}" rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: '"query" is required. Provide a search string.' };
        }
        const result = this.handleSearchEndpoints(query);
        this.logger.log(`Tool searchEndpoints: found ${'endpoints' in result ? result.endpoints.length : 0} endpoints`);
        return result;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools['callEndpoint'] = (tool as any)({
      description: 'Call an API endpoint. Use searchEndpoints first to find the right one.',
      parameters: z.object({
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
        path: z.string().describe('API path with params substituted'),
        body: z.record(z.string(), z.unknown()).optional().describe('Request body for POST/PUT/PATCH'),
        query: z.record(z.string(), z.string()).optional().describe('Query string parameters'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const method = (args.method as string) || 'GET';
        const path = this.extractStringArg(args, 'path', ['endpoint', 'url', 'route']) || '';
        const body = (args.body || args.data || args.payload) as Record<string, unknown> | undefined;
        this.logger.log(`Tool callEndpoint: ${method} ${path} rawArgs=${JSON.stringify(args)}`);
        if (!path) {
          return { success: false, error: 'Missing tool parameter "path". Use: callEndpoint({ method: "POST", path: "/api/projects", body: { name: "test" } })' };
        }
        const result = await this.handleCallEndpoint(
          { method, path, body, query: args.query as Record<string, string> },
          sessionCookie,
        );
        this.logger.log(`Tool callEndpoint: ${method} ${path} -> ${result.success ? 'OK' : 'FAIL'} status=${result.status ?? 'N/A'}${result.error ? ` error="${result.error}"` : ''}`);
        return result;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools['searchDocs'] = (tool as any)({
      description: 'search in documentation.',
      parameters: z.object({
        query: z.string().describe('Text to search for'),
        maxResults: z.number().optional().describe('Max results (default: 10)'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q', 'text']);
        this.logger.log(`Tool searchDocs: query="${query}" rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: '"query" is required.' };
        }
        return this.ragService.textSearch(query, (args.maxResults as number) || undefined);
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools['searchDocumentation'] = (tool as any)({
      description: 'Semantic search in documentation by meaning. Find relevant docs for a topic or question.',
      parameters: z.object({
        query: z.string().describe('Natural language query for doc search'),
        maxResults: z.number().optional().describe('Max results (default: 5)'),
      }),
      execute: async (args: Record<string, unknown>) => {
        const query = this.extractStringArg(args, 'query', ['keyword', 'search', 'q', 'text']);
        this.logger.log(`Tool searchDocumentation: query="${query}" indexed=${this.ragService.isIndexed} rawArgs=${JSON.stringify(args)}`);
        if (!query) {
          return { error: '"query" is required.' };
        }
        if (!this.ragService.isIndexed) {
          return { error: 'Doc index not ready. RAG indexing may still be in progress.' };
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

  private handleSearchEndpoints(query: string): { endpoints: unknown[] } | { error: string } {
    if (!this.endpointIndex) {
      return { error: 'OpenAPI spec not loaded yet.' };
    }

    const results = this.endpointIndex.search(query);

    if (results.length === 0) {
      return { endpoints: [], error: `No match for "${query}". Try different keywords.` } as { endpoints: unknown[]; error: string };
    }

    return { endpoints: results.map((ep) => this.compactEndpoint(ep)) };
  }

  private compactEndpoint(ep: EndpointInfo): unknown {
    const params = ep.parameters
      .filter((p) => p.in === 'path' || p.required)
      .map((p) => `${p.name}${p.required ? '*' : ''}:${p.type}`)
      .join(', ');

    const optionalQuery = ep.parameters
      .filter((p) => p.in === 'query' && !p.required)
      .map((p) => p.name)
      .join(', ');

    const compact: Record<string, unknown> = {
      m: ep.method,
      p: ep.path,
      d: ep.summary || ep.operationId,
    };

    if (params) compact.params = params;
    if (optionalQuery) compact.q = optionalQuery;
    if (ep.requestBodySummary) compact.body = this.compactBodySummary(ep.requestBodySummary);

    return compact;
  }

  private compactBodySummary(summary: string): string {
    return summary
      .replace(/\n\s*/g, ' ')
      .replace(/\s*—\s*[^,}]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
