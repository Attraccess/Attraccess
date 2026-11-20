import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { setMcpDelegation } from '../users-and-auth/strategies/mcp-delegation';
import { McpOAuthService } from './mcp-oauth.service';
import { ACCESS_TOKEN_PREFIX } from './mcp-oauth-rules';
import { McpPublicUrls } from './mcp-public-urls.service';

/**
 * Authenticates `/mcp`. Only a bearer token counts: an ATT-919 API token (checked by the existing
 * `SessionStrategy`, permission intersection included) or an MCP OAuth access token for this resource.
 * Cookies, user session tokens and every other bearer get `401` with the protected-resource metadata link.
 */
@Injectable()
export class McpBearerGuard extends AuthGuard('session') {
  constructor(
    private readonly urls: McpPublicUrls,
    private readonly oauth: McpOAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const endpoints = await this.urls.resolve(request);
    const reject = (): never => {
      response.setHeader(
        'WWW-Authenticate',
        endpoints.oauthEnabled
          ? `Bearer resource_metadata="${endpoints.resourceMetadata}"`
          : 'Bearer realm="Attraccess MCP"',
      );
      throw new UnauthorizedException('A valid API token or MCP OAuth access token is required');
    };

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return reject();

    if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
      const delegation = endpoints.oauthEnabled
        ? await this.oauth.authenticateAccessToken(token, endpoints.resource)
        : null;
      if (!delegation) return reject();
      setMcpDelegation(request, delegation);
    }
    try {
      await super.canActivate(context);
    } catch (error) {
      if (error instanceof UnauthorizedException) return reject();
      throw error;
    }
    const method = (request.user as { authenticationMethod?: string } | undefined)?.authenticationMethod;
    // A user session token is also a valid REST bearer; it is not an MCP credential.
    if (method !== 'api-token' && method !== 'mcp-oauth') return reject();
    return true;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) throw err instanceof Error ? err : new UnauthorizedException();
    return user;
  }
}
