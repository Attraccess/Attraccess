import { Profile, Strategy } from 'passport-openidconnect';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SSOProviderOIDCConfiguration, SSOProviderType, User } from '@attraccess/database-entities';
import { UsersService } from '../../../users/users.service';
import { ModuleRef } from '@nestjs/core';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';

@Injectable()
export class SSOOIDCStrategy extends PassportStrategy(Strategy, 'sso-oidc') {
  private readonly logger = new Logger(SSOOIDCStrategy.name);
  private readonly config: SSOProviderOIDCConfiguration;

  constructor(private moduleRef: ModuleRef, config: SSOProviderOIDCConfiguration, callbackURL: string) {
    super({
      issuer: config.issuer,
      authorizationURL: config.authorizationURL,
      userInfoURL: config.userInfoURL,
      tokenURL: config.tokenURL,
      clientID: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL,
      scope: ['openid', 'email', 'profile'],
    });

    this.logger.log(`Initialized OIDC strategy with issuer: ${config.issuer} and callbackURL: ${callbackURL}`);
    this.config = config;
  }

  async validate(_issuer: string, profile: Profile): Promise<User> {
    this.logger.log(`Validating OIDC profile for issuer: ${_issuer}`);

    const emails = profile.emails || [];
    const oidcUserId = profile.id;

    if (emails.length === 0) {
      this.logger.error('No emails found in SSO profile', profile);
      throw new BadRequestException('No emails found in SSO profile');
    }

    if (!oidcUserId) {
      this.logger.error('No user ID found in SSO profile');
      throw new BadRequestException('No user ID found in SSO profile');
    }

    const usersService = await this.moduleRef.get(UsersService);

    // Step 1: Check if user exists by external ID
    this.logger.debug(`Checking if user exists with external ID: ${oidcUserId}`);
    let user = await usersService.findOne({ externalIdentifier: oidcUserId }).catch(() => null);

    if (user) {
      this.logger.log(`Found existing user with external ID: ${oidcUserId}`);
      return user;
    }

    // Step 2: No user found by external ID, check by email
    const email = emails[0].value;
    this.logger.debug(`Checking if user exists with email: ${email}`);
    user = await usersService.findOne({ email }, ['authenticationDetails']).catch(() => null);

    if (user) {
      if (user.authenticationDetails.length === 0) {
        this.logger.log(`User with email ${email} has no auth details, no need to provide password.`);
        return await usersService.updateOne(user.id, { externalIdentifier: oidcUserId });
      }

      // Step 3: User exists with email but no external ID
      // This requires user to authenticate with password to link accounts
      this.logger.log(`Found user with email ${email} but no external ID. Account linking required.`);

      // Here you'll need to implement a flow to:
      // 1. Redirect to a password verification page
      // 2. Store pending OIDC data in session/temporary storage
      // 3. After password verification, set external ID and complete login

      // For now, throw an exception that triggers the linking flow
      throw new AccountLinkingRequiredException({
        email,
        externalId: oidcUserId,
        providerId: this.config.ssoProviderId,
        providerType: SSOProviderType.OIDC,
      });
    }

    // Step 4: No user exists, create new user with external ID
    const username = profile.username || email;
    this.logger.log(`Creating new user with external ID: ${oidcUserId}`);
    user = await usersService.createOne({ username, email, externalIdentifier: oidcUserId });

    if (!user) {
      this.logger.error('Failed to create user after SSO authentication');
      throw new UnauthorizedException();
    }

    this.logger.log(`New user (ID: ${user.id}) created successfully with external ID: ${oidcUserId}`);
    return user;
  }
}
