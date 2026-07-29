import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { SettingsService } from '../../../../settings/settings.service';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY, SSO_OIDC_STATE_REQUEST_KEY } from './oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { SSOService } from '../sso.service';
import { SSOProviderType } from '@attraccess/database-entities';
import {
  InvalidSSOProviderIdException,
  InvalidSSOProviderTypeException,
  SSOProviderNotFoundException,
} from '../errors';
import { LicenseModuleType, LicenseService } from '../../../../license/license.service';
import { OidcCookieStateStore } from './oidc-cookie-state-store';
import { MetricsService } from '../../../../metrics/metrics.service';
import { recordSsoLoginFailure } from '../sso-metrics';

@Injectable()
export class SSOOIDCGuard implements CanActivate {
  private readonly logger = new Logger(SSOOIDCGuard.name);

  public constructor(
    private ssoService: SSOService,
    private moduleRef: ModuleRef,
    private settingsService: SettingsService,
    private licenseService: LicenseService,
    private stateStore: OidcCookieStateStore,
    private metricsService: MetricsService,
  ) { }

  async canActivate(context: ExecutionContext) {
    this.logger.debug('OIDC Guard activation attempted');
    const req = context.switchToHttp().getRequest();

    // Enforce licensing for SSO usage
    try {
      await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'SSO not permitted by license';
      this.logger.warn(`Blocking SSO request due to license: ${reason}`);
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new ForbiddenException('SSO is not permitted by the current license');
    }

    this.logger.debug(`Request URL: ${req.url}`);
    const url = await this.settingsService.getUrl();
    if (!url) {
      this.logger.error('Application URL not configured. Cannot construct URLs.');
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      return false;
    }
    const requestURL = new URL(url + req.url);

    // e.g. something/sso/oidc/156/login
    const urlPathParts = requestURL.pathname.split('/');
    this.logger.debug(`URL path parts: ${JSON.stringify(urlPathParts)}`);
    const [routeAction, providerIdString, ssoType] = urlPathParts.reverse();
    const providerId = parseInt(providerIdString);
    this.logger.debug(`Extracted providerId: ${providerId}, ssoType: ${ssoType}, from URL: ${req.url}`);

    if (isNaN(providerId)) {
      this.logger.error(`Invalid SSO provider ID: ${providerIdString}`);
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new InvalidSSOProviderIdException();
    }

    if (ssoType !== SSOProviderType.OIDC) {
      this.logger.error(`Invalid SSO provider type: ${ssoType}, expected: ${SSOProviderType.OIDC}`);
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new InvalidSSOProviderTypeException();
    }

    this.logger.debug(`Fetching provider with type: ${ssoType} and id: ${providerId}`);
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(ssoType, providerId);

    if (!provider) {
      this.logger.error(`SSO provider not found for type: ${ssoType} and id: ${providerId}`);
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new SSOProviderNotFoundException();
    }

    const oidcConfig = provider.oidcConfiguration;

    if (!oidcConfig) {
      this.logger.error(`OIDC configuration not found for provider id: ${providerId}`);
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new SSOProviderNotFoundException();
    }

    const isCallbackRoute = routeAction === 'callback';
    if (!isCallbackRoute && !requestURL.searchParams.has('redirectTo')) {
      recordSsoLoginFailure(this.metricsService, SSOProviderType.OIDC, 'guard_rejected', this.logger);
      throw new BadRequestException('No redirectTo found in query params');
    }
    const redirectTo = requestURL.searchParams.get('redirectTo') ?? '';

    const callbackURL = new URL(url);
    callbackURL.pathname = `/api/auth/sso/${ssoType}/${providerId}/callback`;

    this.logger.debug(`Callback URL (fixed): ${callbackURL}`);

    this.logger.debug(
      `Initializing SSOOIDC strategy for ${routeAction} with provider id: ${providerId} and callbackURL: ${callbackURL}`
    );
    // Create a new strategy instance with the real provider config.
    // This registers with passport under the 'sso-oidc' name, replacing the
    // placeholder instance created at module startup.
    new SSOOIDCStrategy(this.moduleRef, oidcConfig, callbackURL.toString(), this.stateStore);
    // Also pass callback URL on the request as a backup for the strategy's authenticate() override
    (req as Record<string, unknown>)[SSO_OIDC_CALLBACK_URL_REQUEST_KEY] = callbackURL.toString();
    // For login: pass redirectTo in state so it survives the IdP round-trip (OIDC spec)
    if (!isCallbackRoute) {
      (req as Record<string, unknown>)[SSO_OIDC_STATE_REQUEST_KEY] = { redirectTo };
    }
    this.logger.debug(`OIDC Guard activation for ${routeAction} successful`);
    return true;
  }
}
