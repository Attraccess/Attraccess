import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../config/app.config';
import { ToolRegistry } from './tool-registry';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);
  private appUrl!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolRegistry: ToolRegistry,
  ) {
    const appConfig = this.configService.get<AppConfigType>('app');
    this.appUrl = appConfig?.ATTRACCESS_URL || 'http://localhost:3000';
  }

  async execute(
    operationId: string,
    args: Record<string, unknown>,
    sessionCookie: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const endpoint = this.toolRegistry.getEndpoint(operationId);
    if (!endpoint) {
      return { success: false, error: `Unknown tool: ${operationId}` };
    }

    let resolvedPath = endpoint.path;
    for (const [key, value] of Object.entries(args)) {
      resolvedPath = resolvedPath.replace(`{${key}}`, String(value));
    }

    const url = `${this.appUrl}${resolvedPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    };

    try {
      const fetchOptions: RequestInit = { method: endpoint.method, headers };

      if (endpoint.method === 'POST' || endpoint.method === 'PUT' || endpoint.method === 'PATCH') {
        const bodyArgs = { ...args };
        for (const match of endpoint.path.matchAll(/\{(\w+)\}/g)) {
          delete bodyArgs[match[1]];
        }
        if (Object.keys(bodyArgs).length > 0) {
          fetchOptions.body = JSON.stringify(bodyArgs);
        }
      }

      const res = await fetch(url, fetchOptions);
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return { success: false, error: `API returned ${res.status}: ${JSON.stringify(data)}` };
      }

      return { success: true, data };
    } catch (err) {
      this.logger.error(`Tool execution failed for ${operationId}`, err);
      return { success: false, error: `Failed to execute ${operationId}: ${err.message}` };
    }
  }
}
