import { Injectable, Logger } from '@nestjs/common';
import { OllamaTool } from '../ollama.service';

interface ToolEndpoint {
  method: string;
  path: string;
  tool: OllamaTool;
}

const ALLOWED_ENDPOINTS: { method: string; path: string; operationId: string; description: string }[] = [
  { method: 'GET', path: '/api/resources', operationId: 'listResources', description: 'List all resources the user has access to' },
  { method: 'GET', path: '/api/resources/{id}', operationId: 'getResource', description: 'Get details of a specific resource by ID' },
  { method: 'GET', path: '/api/users/me', operationId: 'getCurrentUser', description: 'Get the current authenticated user profile' },
  { method: 'GET', path: '/api/projects', operationId: 'listProjects', description: 'List all projects the user is a member of' },
  { method: 'GET', path: '/api/projects/{id}', operationId: 'getProject', description: 'Get details of a specific project by ID' },
  { method: 'GET', path: '/api/billing/balance', operationId: 'getBillingBalance', description: 'Get the current billing balance for the user' },
  { method: 'GET', path: '/api/billing/transactions', operationId: 'getBillingTransactions', description: 'List billing transactions for the user' },
  { method: 'POST', path: '/api/resources/{id}/usage/start', operationId: 'startResourceUsage', description: 'Start using a resource (begin a usage session)' },
  { method: 'POST', path: '/api/resources/{id}/usage/stop', operationId: 'stopResourceUsage', description: 'Stop using a resource (end a usage session)' },
];

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly endpoints: Map<string, ToolEndpoint> = new Map();

  constructor() {
    this.registerEndpoints();
  }

  private registerEndpoints() {
    for (const endpoint of ALLOWED_ENDPOINTS) {
      const pathParams = (endpoint.path.match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1));

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const param of pathParams) {
        properties[param] = { type: 'integer', description: `The ${param} parameter` };
        required.push(param);
      }

      if (endpoint.method === 'GET' && endpoint.path.includes('transactions')) {
        properties['limit'] = { type: 'integer', description: 'Max number of transactions to return' };
      }

      const tool: OllamaTool = {
        type: 'function',
        function: {
          name: endpoint.operationId,
          description: endpoint.description,
          parameters: { type: 'object', properties, required },
        },
      };

      this.endpoints.set(endpoint.operationId, { method: endpoint.method, path: endpoint.path, tool });
    }

    this.logger.log(`Registered ${this.endpoints.size} AI tool endpoints`);
  }

  getTools(): OllamaTool[] {
    return Array.from(this.endpoints.values()).map((e) => e.tool);
  }

  getEndpoint(operationId: string): { method: string; path: string } | undefined {
    const endpoint = this.endpoints.get(operationId);
    return endpoint ? { method: endpoint.method, path: endpoint.path } : undefined;
  }
}
