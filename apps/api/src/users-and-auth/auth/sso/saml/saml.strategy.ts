import { SSOProviderType, User } from '@attraccess/database-entities';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PassportSamlConfig, Profile as SamlProfile } from '@node-saml/passport-saml';
import { MetricsService } from '../../../../metrics/metrics.service';
import { UsersService } from '../../../users/users.service';
import { AccountLinkingRequiredException } from '../oidc/exceptions/account-linking-required.exception';
import { classifySsoFailureReason, markSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';
import { SamlRoleProvisioningImplementation } from './saml-role-provisioning';
import { SamlOptionsCallback } from './saml.strategy.route-context';
import { SSOSamlRequest } from './saml.types';

@Injectable()
export class SSOSamlStrategy extends SamlRoleProvisioningImplementation {
  protected readonly logger = new Logger(SSOSamlStrategy.name);

  constructor(protected readonly moduleRef: ModuleRef) {
    const bootstrapLogger = new Logger(SSOSamlStrategy.name);
    const getSamlOptions = (req: SSOSamlRequest, done: SamlOptionsCallback) => {
      const requestOptions = req?.ssoSamlOptions;
      if (!requestOptions?.samlConfiguration) {
        bootstrapLogger.warn('Missing SAML request options; ensure SSOSamlGuard runs before AuthGuard.');
        return done(new BadRequestException('Missing SAML configuration') as unknown as Error);
      }

      try {
        const samlOptions = SSOSamlStrategy.buildPassportConfig(moduleRef, requestOptions, bootstrapLogger);
        return done(null, samlOptions);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        bootstrapLogger.error(`Failed to build SAML options: ${reason}`);
        return done(error instanceof Error ? error : new Error(reason));
      }
    };

    super({
      passReqToCallback: true,
      getSamlOptions,
    } as unknown as PassportSamlConfig);
  }

  protected recordFailure(error: unknown): void {
    try {
      const metricsService = this.moduleRef.get(MetricsService, { strict: false });
      recordSsoLoginFailure(metricsService, SSOProviderType.SAML, classifySsoFailureReason(error), this.logger);
      markSsoFailureMetricRecorded(error);
    } catch (metricsError) {
      this.logger.warn(
        `Failed to resolve MetricsService for SSO login failure metric: ${metricsError instanceof Error ? metricsError.message : String(metricsError)}`,
      );
    }
  }

  async validate(req: SSOSamlRequest, profile: SamlProfile): Promise<User> {
    const requestOptions = req?.ssoSamlOptions;
    if (!requestOptions?.samlConfiguration) {
      this.logger.error('SAML configuration missing on request');
      const error = new BadRequestException('Missing SAML configuration');
      this.recordFailure(error);
      throw error;
    }

    const config = requestOptions.samlConfiguration;
    const providerId = requestOptions.providerId ?? config.ssoProviderId;
    const samlUserId = typeof profile?.nameID === 'string' ? profile.nameID : undefined;
    if (!samlUserId) {
      this.logger.error('No NameID found in SAML assertion');
      const error = new BadRequestException('No NameID found in SAML assertion');
      this.recordFailure(error);
      throw error;
    }

    const usersService = await this.moduleRef.get(UsersService);
    const email = this.resolveEmail(profile, config);

    if (!email) {
      this.logger.error('No email attribute could be resolved from the SAML assertion');
      const error = new BadRequestException('No email found in SAML assertion');
      this.recordFailure(error);
      throw error;
    }

    let user = await usersService.findOne({ externalIdentifier: samlUserId }).catch(() => null);
    if (user) {
      return await this.syncPermissionsFromClaims(user, profile, config);
    }

    user = await usersService.findOne({ email }, ['authenticationDetails']).catch(() => null);
    if (user) {
      if (user.authenticationDetails.length === 0) {
        const updated = await usersService.updateOne(user.id, { externalIdentifier: samlUserId });
        return await this.syncPermissionsFromClaims(updated, profile, config);
      }

      const error = new AccountLinkingRequiredException({
        email,
        externalId: samlUserId,
        providerId,
        providerType: SSOProviderType.SAML,
      });
      throw error;
    }

    const rawUsername = this.resolveDisplayName(profile, email);
    const username = usersService.buildUsernameFromSSOClaim(rawUsername, email);
    user = await usersService
      .createOne({
        username,
        email,
        externalIdentifier: samlUserId,
        isEmailVerified: true,
      })
      .catch((error: Error) => {
        this.logger.error('Failed to create user after SAML authentication', error.stack);
        return null;
      });

    if (!user) {
      const error = new UnauthorizedException();
      this.recordFailure(error);
      throw error;
    }

    await this.recordProvisioningAudit(user.id, config.ssoProviderId, 'user_created');
    return await this.syncPermissionsFromClaims(user, profile, config);
  }
}
