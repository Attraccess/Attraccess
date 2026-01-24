import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../../../config/app.config';
import { SSOService } from '../sso.service';
import { SSOProviderType } from '@attraccess/database-entities';
import {
  InvalidSSOProviderIdException,
  InvalidSSOProviderTypeException,
  SSOProviderNotFoundException,
} from '../errors';
import { LicenseModuleType, LicenseService } from '../../../../license/license.service';
import { SSOSamlRequest } from './saml.types';

@Injectable()
export class SSOSamlGuard implements CanActivate {
  private readonly logger = new Logger(SSOSamlGuard.name);

  constructor(
    private readonly ssoService: SSOService,
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.debug('SAML Guard activation attempted');
    const req = context.switchToHttp().getRequest();

    try {
      await this.licenseService.verifyLicense({ modules: [LicenseModuleType.SSO] });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'SSO not permitted by license';
      this.logger.warn(`Blocking SSO request due to license: ${reason}`);
      throw new ForbiddenException('SSO is not permitted by the current license');
    }

    const appConfig = this.configService.get<AppConfigType>('app');
    if (!appConfig) {
      this.logger.error("App configuration ('app') not found. Cannot construct URLs.");
      return false;
    }

    const requestURL = new URL(appConfig.ATTRACCESS_FRONTEND_URL + req.url);
    const urlPathParts = requestURL.pathname.split('/');
    const [, providerIdString, ssoType] = urlPathParts.reverse();
    const providerId = parseInt(providerIdString, 10);

    if (isNaN(providerId)) {
      throw new InvalidSSOProviderIdException();
    }

    if (ssoType !== SSOProviderType.SAML) {
      throw new InvalidSSOProviderTypeException();
    }

    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(ssoType, providerId);
    if (!provider || !provider.samlConfiguration) {
      throw new SSOProviderNotFoundException();
    }

    const rawRedirect = requestURL.searchParams.get('redirectTo');
    let redirectTo: string;

    try {
      redirectTo = rawRedirect
        ? new URL(rawRedirect, appConfig.ATTRACCESS_FRONTEND_URL).toString()
        : appConfig.ATTRACCESS_FRONTEND_URL;
    } catch {
      this.logger.warn(`Invalid redirectTo provided: ${rawRedirect ?? 'undefined'}`);
      throw new BadRequestException('Invalid redirectTo parameter');
    }

    const callbackURL = new URL(appConfig.ATTRACCESS_URL);
    callbackURL.pathname = `/api/auth/sso/${ssoType}/${providerId}/callback`;

    // Persist RelayState for passport-saml to round-trip the redirect target
    const queryBag = req.query as Record<string, unknown> | undefined;
    if (queryBag && typeof queryBag === 'object') {
      (queryBag as Record<string, string>).RelayState = redirectTo;
    } else {
      this.logger.warn('Unable to attach RelayState; missing request query container.');
    }

    const samlRequest = req as SSOSamlRequest;
    samlRequest.ssoSamlOptions = {
      providerId,
      samlConfiguration: provider.samlConfiguration,
      callbackUrl: callbackURL.toString(),
    };
    this.logger.debug(
      `Prepared per-request SAML options for provider ${providerId} with callback ${callbackURL.toString()}`,
    );

    return true;
  }
}
