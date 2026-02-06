import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { SettingsService } from '../../../../settings/settings.service';
import { SSOOIDCStrategy, SSO_OIDC_CALLBACK_URL_REQUEST_KEY } from './oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { SSOService } from '../sso.service';
import { SSOProviderType } from '@attraccess/database-entities';
import {
  InvalidSSOProviderIdException,
  InvalidSSOProviderTypeException,
  SSOProviderNotFoundException,
} from '../errors';
import { LicenseModuleType, LicenseService } from '../../../../license/license.service';

@Injectable()
export class SSOOIDCGuard implements CanActivate {
  private readonly logger = new Logger(SSOOIDCGuard.name);

  public constructor(
    private ssoService: SSOService,
    private moduleRef: ModuleRef,
    private settingsService: SettingsService,
    private licenseService: LicenseService
  ) {}

  async canActivate(context: ExecutionContext) {
    this.logger.debug('OIDC Guard activation attempted');
    const req = context.switchToHttp().getRequest();

    // Enforce licensing for SSO usage
    try {
      await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'SSO not permitted by license';
      this.logger.warn(`Blocking SSO request due to license: ${reason}`);
      throw new ForbiddenException('SSO is not permitted by the current license');
    }

    this.logger.debug(`Request URL: ${req.url}`);
    const frontendUrl = await this.settingsService.getFrontendUrl();
    if (!frontendUrl) {
      this.logger.error('Frontend URL not configured. Cannot construct URLs.');
      // Consider throwing an InternalServerErrorException for clearer error handling upstream
      return false;
    }
    const requestURL = new URL(frontendUrl + req.url);

    // e.g. something/sso/oidc/156/login
    const urlPathParts = requestURL.pathname.split('/');
    this.logger.debug(`URL path parts: ${JSON.stringify(urlPathParts)}`);
    const [routeAction, providerIdString, ssoType] = urlPathParts.reverse();
    const providerId = parseInt(providerIdString);
    this.logger.debug(`Extracted providerId: ${providerId}, ssoType: ${ssoType}, from URL: ${req.url}`);

    if (isNaN(providerId)) {
      this.logger.error(`Invalid SSO provider ID: ${providerIdString}`);
      throw new InvalidSSOProviderIdException();
    }

    if (ssoType !== SSOProviderType.OIDC) {
      this.logger.error(`Invalid SSO provider type: ${ssoType}, expected: ${SSOProviderType.OIDC}`);
      throw new InvalidSSOProviderTypeException();
    }

    this.logger.debug(`Fetching provider with type: ${ssoType} and id: ${providerId}`);
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(ssoType, providerId);

    if (!provider) {
      this.logger.error(`SSO provider not found for type: ${ssoType} and id: ${providerId}`);
      throw new SSOProviderNotFoundException();
    }

    const oidcConfig = provider.oidcConfiguration;

    if (!oidcConfig) {
      this.logger.error(`OIDC configuration not found for provider id: ${providerId}`);
      throw new SSOProviderNotFoundException();
    }

    const isCallbackRoute = routeAction === 'callback';
    if (!isCallbackRoute && !requestURL.searchParams.has('redirectTo')) {
      throw new BadRequestException('No redirectTo found in query params');
    }
    const redirectTo = requestURL.searchParams.get('redirectTo') ?? '';

    const backendUrl = await this.settingsService.getBackendUrl();
    if (!backendUrl) {
      this.logger.error('Backend URL not configured. Cannot construct callback URLs.');
      return false;
    }
    const callbackURL = new URL(backendUrl);
    callbackURL.pathname = `/api/auth/sso/${ssoType}/${providerId}/callback`;
    callbackURL.searchParams.set('redirectTo', redirectTo);

    this.logger.debug(`Callback URL from query params: ${callbackURL}`);

    this.logger.debug(
      `Initializing SSOOIDC strategy for ${routeAction} with provider id: ${providerId} and callbackURL: ${callbackURL}`
    );
    // Pass callback URL to the strategy so it uses current settings (no restart needed when URLs change)
    (req as Record<string, unknown>)[SSO_OIDC_CALLBACK_URL_REQUEST_KEY] = callbackURL.toString();
    this.logger.debug(`OIDC Guard activation for ${routeAction} successful`);
    return true;
  }
}
