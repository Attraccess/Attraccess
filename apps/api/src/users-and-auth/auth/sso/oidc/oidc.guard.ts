import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { SSOOIDCStrategy } from './oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { SSOService } from '../sso.service';
import { SSOProviderType } from '@attraccess/database-entities';
import {
  InvalidSSOProviderIdException,
  InvalidSSOProviderTypeException,
  SSOProviderNotFoundException,
} from '../errors';
import { loadEnv } from '@attraccess/env';

const env = loadEnv((z) => ({
  VITE_API_URL: z.string(),
}));

@Injectable()
export class SSOOIDCGuard implements CanActivate {
  private readonly logger = new Logger(SSOOIDCGuard.name);

  public constructor(
    private ssoService: SSOService,
    private moduleRef: ModuleRef
  ) {}

  async canActivate(context: ExecutionContext) {
    this.logger.log('OIDC Guard activation attempted');
    const req = context.switchToHttp().getRequest();

    this.logger.debug(`Request URL: ${req.url}`);
    const requestURL = new URL(env.VITE_API_URL + req.url);

    // e.g. something/sso/oidc/156/login
    const urlPathParts = requestURL.pathname.split('/');
    this.logger.debug(`URL path parts: ${JSON.stringify(urlPathParts)}`);
    const [routeAction, providerIdString, ssoType] = urlPathParts.reverse();
    const providerId = parseInt(providerIdString);
    this.logger.debug(
      `Extracted providerId: ${providerId}, ssoType: ${ssoType}, from URL: ${req.url}`
    );

    if (isNaN(providerId)) {
      this.logger.error(`Invalid SSO provider ID: ${providerIdString}`);
      throw new InvalidSSOProviderIdException();
    }

    if (ssoType !== SSOProviderType.OIDC) {
      this.logger.error(
        `Invalid SSO provider type: ${ssoType}, expected: ${SSOProviderType.OIDC}`
      );
      throw new InvalidSSOProviderTypeException();
    }

    this.logger.debug(
      `Fetching provider with type: ${ssoType} and id: ${providerId}`
    );
    const provider =
      await this.ssoService.getProviderByTypeAndIdWithConfiguration(
        ssoType,
        providerId
      );

    if (!provider) {
      this.logger.error(
        `SSO provider not found for type: ${ssoType} and id: ${providerId}`
      );
      throw new SSOProviderNotFoundException();
    }

    const oidcConfig = provider.oidcConfiguration;

    if (!oidcConfig) {
      this.logger.error(
        `OIDC configuration not found for provider id: ${providerId}`
      );
      throw new SSOProviderNotFoundException();
    }

    if (!requestURL.searchParams.has('redirectTo')) {
      throw new BadRequestException('No redirectTo found in query params');
    }

    const redirectTo = requestURL.searchParams.get('redirectTo');

    const callbackURL = new URL(env.VITE_API_URL);
    callbackURL.pathname = `/api/auth/sso/${ssoType}/${providerId}/callback`;
    callbackURL.searchParams.set('redirectTo', redirectTo);

    this.logger.debug(`Callback URL from query params: ${callbackURL}`);

    this.logger.debug(
      `Initializing SSOOIDCStrategy for ${routeAction} with provider id: ${providerId} and callbackURL: ${callbackURL}`
    );
    new SSOOIDCStrategy(this.moduleRef, oidcConfig, callbackURL.toString());
    this.logger.log(`OIDC Guard activation for ${routeAction} successful`);
    return true;
  }
}
