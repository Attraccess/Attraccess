import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import type { Request, Response } from 'express';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { resolveIp } from '../users-and-auth/rate-limiting/login.rate-limit.guard';
import { McpOAuthConsentDto, McpOAuthRedirectDto } from './mcp-oauth.dto';
import { McpOAuthError, McpOAuthService } from './mcp-oauth.service';
import { McpEndpoints, McpPublicUrls } from './mcp-public-urls.service';
import { McpRateLimit, McpRateLimitGuard } from './mcp-rate-limit.guard';

/** Sends the browser to the frontend error page. Only a fixed error code travels, never client-supplied text. */
function errorPage(res: Response, endpoints: McpEndpoints, code: string): void {
  const url = new URL(endpoints.errorPageUrl);
  url.searchParams.set('error', code);
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url.toString());
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function oauthJsonError(res: Response, error: McpOAuthError): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(error.status).json({ error: error.code, error_description: error.message });
}

/** Resolves the endpoints, or answers 404 when OAuth is unavailable on this deployment (plain HTTP, non-loopback). */
async function oauthEndpoints(urls: McpPublicUrls, request: Request): Promise<McpEndpoints> {
  const endpoints = await urls.resolve(request);
  if (!endpoints.oauthEnabled) {
    throw new HttpException(
      {
        error: 'oauth_disabled',
        error_description: 'MCP OAuth requires an https or loopback public URL; use an API token.',
      },
      404,
    );
  }
  return endpoints;
}

/** OAuth discovery, registration, authorization and token endpoints for MCP clients. Not part of the OpenAPI document. */
@ApiExcludeController()
@Controller()
@UseGuards(McpRateLimitGuard)
export class McpOAuthController {
  constructor(
    private readonly urls: McpPublicUrls,
    private readonly oauth: McpOAuthService,
    private readonly rbac: RbacService,
  ) {}

  /** RFC 9728. The path-suffixed form is what a client derives from the MCP URL. */
  @Get(['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/{*resourcePath}'])
  @McpRateLimit('authorize')
  @Header('Cache-Control', 'public, max-age=300')
  async protectedResource(@Req() req: Request, @Param('resourcePath') resourcePath: string | string[] | undefined) {
    const endpoints = await oauthEndpoints(this.urls, req);
    const suffix = Array.isArray(resourcePath) ? resourcePath.join('/') : resourcePath;
    if (suffix !== undefined && new URL(endpoints.resource).pathname !== `/${suffix}`) {
      throw new HttpException({ error: 'not_found', error_description: 'Unknown protected resource' }, 404);
    }
    return {
      resource: endpoints.resource,
      authorization_servers: [endpoints.origin],
      bearer_methods_supported: ['header'],
      resource_name: 'Attraccess MCP',
    };
  }

  /** RFC 8414, plus the OIDC discovery location as a fallback for clients that only try that one. */
  @Get(['.well-known/oauth-authorization-server', '.well-known/openid-configuration'])
  @McpRateLimit('authorize')
  @Header('Cache-Control', 'public, max-age=300')
  async authorizationServer(@Req() req: Request) {
    const endpoints = await oauthEndpoints(this.urls, req);
    return {
      issuer: endpoints.origin,
      authorization_endpoint: endpoints.authorizationEndpoint,
      token_endpoint: endpoints.tokenEndpoint,
      registration_endpoint: endpoints.registrationEndpoint,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: (await this.rbac.getPermissions()).map((permission) => permission.key),
      authorization_response_iss_parameter_supported: true,
    };
  }

  @Post('mcp/oauth/register')
  @McpRateLimit('register')
  async register(@Req() req: Request, @Body() body: unknown, @Res() res: Response): Promise<void> {
    await oauthEndpoints(this.urls, req);
    try {
      const metadata =
        body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json(await this.oauth.registerClient(metadata, resolveIp(req)));
    } catch (error) {
      if (error instanceof McpOAuthError) return oauthJsonError(res, error);
      throw error;
    }
  }

  @Get('mcp/oauth/authorize')
  @McpRateLimit('authorize')
  async authorize(@Req() req: Request, @Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const endpoints = await oauthEndpoints(this.urls, req);
    try {
      const result = await this.oauth.startAuthorization(
        {
          clientId: text(query.client_id),
          redirectUri: text(query.redirect_uri),
          responseType: text(query.response_type),
          codeChallenge: text(query.code_challenge),
          codeChallengeMethod: text(query.code_challenge_method),
          state: text(query.state),
          scope: text(query.scope),
          resource: text(query.resource),
        },
        endpoints.resource,
      );
      if ('redirectError' in result) {
        if (result.redirectError.trusted) {
          res.redirect(302, this.oauth.buildErrorRedirect(result.redirectError, endpoints.origin));
        } else {
          errorPage(res, endpoints, result.redirectError.error);
        }
        return;
      }
      const consent = new URL(endpoints.consentUrl);
      consent.searchParams.set('request', result.requestId);
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, consent.toString());
    } catch (error) {
      if (!(error instanceof McpOAuthError)) throw error;
      // The client or redirect URI could not be verified: show the problem in Attraccess, never redirect to it.
      errorPage(res, endpoints, error.code === 'invalid_client' ? 'invalid_client' : 'invalid_redirect_uri');
    }
  }

  @Post('mcp/oauth/token')
  @HttpCode(200)
  @McpRateLimit('token')
  async token(@Req() req: Request, @Body() body: unknown, @Res() res: Response): Promise<void> {
    const endpoints = await oauthEndpoints(this.urls, req);
    const form = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    try {
      const grantType = text(form.grant_type);
      if (grantType === 'authorization_code') {
        res.json(
          await this.oauth.exchangeCode(
            {
              clientId: text(form.client_id),
              code: text(form.code),
              redirectUri: text(form.redirect_uri),
              codeVerifier: text(form.code_verifier),
              resource: text(form.resource),
            },
            endpoints.resource,
          ),
        );
      } else if (grantType === 'refresh_token') {
        res.json(
          await this.oauth.refresh(
            { clientId: text(form.client_id), refreshToken: text(form.refresh_token), resource: text(form.resource) },
            endpoints.resource,
          ),
        );
      } else {
        throw new McpOAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
      }
    } catch (error) {
      if (error instanceof McpOAuthError) return oauthJsonError(res, error);
      throw error;
    }
  }
}

/** What the frontend consent page calls, with the user's own browser session. */
@ApiTags('MCP OAuth')
@Controller('mcp/oauth/requests')
@UseGuards(McpRateLimitGuard)
export class McpOAuthConsentController {
  constructor(
    private readonly urls: McpPublicUrls,
    private readonly oauth: McpOAuthService,
  ) {}

  @SessionAuth()
  @Get(':requestId')
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'Show what an MCP client asks to be allowed to do', operationId: 'getMcpOAuthRequest' })
  @ApiOkResponse({ type: McpOAuthConsentDto })
  async describe(@Req() req: AuthenticatedRequest, @Param('requestId') requestId: string): Promise<McpOAuthConsentDto> {
    await oauthEndpoints(this.urls, req as unknown as Request);
    return this.translate(() => this.oauth.describeRequest(requestId, req.user));
  }

  @SessionAuth()
  @Post(':requestId/approve')
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'Allow an MCP client', operationId: 'approveMcpOAuthRequest' })
  @ApiOkResponse({ type: McpOAuthRedirectDto })
  async approve(@Req() req: AuthenticatedRequest, @Param('requestId') requestId: string): Promise<McpOAuthRedirectDto> {
    const endpoints = await oauthEndpoints(this.urls, req as unknown as Request);
    return this.translate(() => this.oauth.approve(requestId, req.user, endpoints.origin));
  }

  @SessionAuth()
  @Post(':requestId/deny')
  @McpRateLimit('consent')
  @ApiOperation({ summary: 'Refuse an MCP client', operationId: 'denyMcpOAuthRequest' })
  @ApiOkResponse({ type: McpOAuthRedirectDto })
  async deny(@Req() req: AuthenticatedRequest, @Param('requestId') requestId: string): Promise<McpOAuthRedirectDto> {
    const endpoints = await oauthEndpoints(this.urls, req as unknown as Request);
    return this.translate(() => this.oauth.deny(requestId, endpoints.origin));
  }

  private async translate<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof McpOAuthError) throw new HttpException(error.message, error.status);
      throw error;
    }
  }
}
