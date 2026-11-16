import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfigType } from '../config/app.config';
import { originOfUrl } from '../common/security/approved-origins.service';
import { SettingsService } from '../settings/settings.service';
import { isSecureOrLoopbackOrigin } from './mcp-oauth-rules';

export interface McpEndpoints {
  /** Public origin of the API; also the OAuth issuer. */
  origin: string;
  /** Canonical URL of the MCP endpoint; the OAuth token audience (RFC 8707). */
  resource: string;
  /** Where clients find the protected-resource metadata (RFC 9728), advertised in WWW-Authenticate. */
  resourceMetadata: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  /** The frontend consent page; the authorization endpoint redirects the browser here. */
  consentUrl: string;
  /** The frontend page for an authorization request that cannot go back to the client. */
  errorPageUrl: string;
  /** False on plain-HTTP, non-loopback deployments: API tokens keep working, OAuth does not. */
  oauthEnabled: boolean;
}

/**
 * The public URLs of the MCP server, resolved from the same Settings URL the rest of the application uses
 * (`SettingsService.getUrl()`, then `ATTRACCESS_URL`). A request only fills in when neither is configured.
 */
@Injectable()
export class McpPublicUrls implements OnApplicationBootstrap {
  private readonly logger = new Logger(McpPublicUrls.name);
  private warnedAbout?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** Resolves the URLs once at startup so that the warning about a disabled OAuth shows up in the boot log. */
  async onApplicationBootstrap(): Promise<void> {
    await this.resolve().catch(() => undefined);
  }

  async resolve(request?: Pick<Request, 'protocol' | 'host'>): Promise<McpEndpoints> {
    const app = this.config.get<AppConfigType>('app');
    const configured = await this.settings.getUrl().catch((error: unknown) => {
      this.logger.error('Could not read the application URL from Settings', error as Error);
      return null;
    });
    const origin =
      originOfUrl(configured) ??
      originOfUrl(app?.ATTRACCESS_URL) ??
      (request?.host ? originOfUrl(`${request.protocol}://${request.host}`) : null);
    if (!origin) throw new Error('The application URL is not configured');

    const prefix = app?.GLOBAL_PREFIX ? `/${app.GLOBAL_PREFIX}` : '';
    const frontend = originOfUrl(app?.ATTRACCESS_FRONTEND_URL) ?? origin;
    const oauthEnabled = isSecureOrLoopbackOrigin(origin);
    if (!oauthEnabled && this.warnedAbout !== origin) {
      this.warnedAbout = origin;
      this.logger.warn(
        `MCP OAuth is disabled: the public URL ${origin} is neither https nor loopback. ` +
          'MCP clients can still use API tokens at the /mcp endpoint.',
      );
    }
    return {
      origin,
      resource: `${origin}${prefix}/mcp`,
      resourceMetadata: `${origin}/.well-known/oauth-protected-resource${prefix}/mcp`,
      authorizationEndpoint: `${origin}${prefix}/mcp/oauth/authorize`,
      tokenEndpoint: `${origin}${prefix}/mcp/oauth/token`,
      registrationEndpoint: `${origin}${prefix}/mcp/oauth/register`,
      consentUrl: `${frontend}/oauth/authorize`,
      errorPageUrl: `${frontend}/oauth/error`,
      oauthEnabled,
    };
  }
}
