import { ExceptionFilter, Catch, ArgumentsHost, Logger, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { SSOLinkTokenService } from '../link-token.service';
import { getRedirectToFromRequest } from './oidc-cookie-state-store';
import { MetricsService } from '../../../../metrics/metrics.service';
import { recordSsoLoginFailure } from '../sso-metrics';
import { ApprovedOriginsService } from '../../../../common/security/approved-origins.service';
import { SSOProviderType } from '@attraccess/database-entities';
import { SettingsService } from '../../../../settings/settings.service';

@Catch(AccountLinkingRequiredException)
export class AccountLinkingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AccountLinkingExceptionFilter.name);

  constructor(
    private readonly linkTokenService: SSOLinkTokenService,
    private readonly metricsService: MetricsService,
    @Optional() private readonly approvedOrigins?: ApprovedOriginsService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  /**
   * A SAML callback is a cross-site POST without the OIDC state cookie. It goes back to the `redirectTo` query or
   * RelayState address when that origin is approved for browser sessions, otherwise to the configured application URL.
   * Unapproved addresses are never used, because the redirect carries the link token.
   */
  private async samlRedirect(request: Request): Promise<string | undefined> {
    const body = request.body as { RelayState?: unknown } | undefined;
    const candidates = [request.query?.redirectTo, body?.RelayState, request.query?.RelayState].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    for (const candidate of this.approvedOrigins ? candidates : []) {
      try {
        const url = new URL(candidate);
        if (await this.approvedOrigins.isApproved(url.origin, request)) return url.toString();
      } catch {
        // malformed address: try the next one
      }
    }
    return (await this.settingsService?.getUrl()) || undefined;
  }

  async catch(exception: AccountLinkingRequiredException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest() as Request;

    this.logger.log(`Account linking required for email: ${exception.email}`);
    recordSsoLoginFailure(this.metricsService, exception.providerType, 'linking_failed', this.logger);

    const redirectTo =
      exception.providerType === SSOProviderType.SAML
        ? await this.samlRedirect(request)
        : getRedirectToFromRequest(
            request as unknown as Record<string, unknown>,
            request.query.redirectTo as string | undefined,
          );
    this.logger.debug('Original query: ', request.query);

    if (redirectTo) {
      // Redirect to frontend with account linking data
      const frontendUrl = new URL(redirectTo);
      // Clear any existing parameters and set account linking parameters
      frontendUrl.search = '';
      const linkToken = await this.linkTokenService.issue({
        email: exception.email,
        providerId: exception.providerId,
        providerType: exception.providerType,
        ssoSubject: exception.externalId,
      });
      frontendUrl.searchParams.set('accountLinking', 'required');
      frontendUrl.searchParams.set('ssoLinkToken', linkToken);
      // Email is provided only for UX display and must not be trusted by the client
      frontendUrl.searchParams.set('email', exception.email);

      this.logger.log(`Redirecting to frontend for account linking: ${frontendUrl.origin}${frontendUrl.pathname}`);
      return response.redirect(frontendUrl.toString());
    }

    // Fallback: return JSON if no redirect URL
    const linkToken = await this.linkTokenService.issue({
      email: exception.email,
      providerId: exception.providerId,
      providerType: exception.providerType,
      ssoSubject: exception.externalId,
    });
    response.status(400).json({
      error: 'AccountLinkingRequired',
      message: 'Account linking required',
      email: exception.email,
      linkToken,
    });
  }
}
