import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

// Services and Controllers
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { SessionService } from './auth/session.service';

// Strategies
import { LocalStrategy } from './strategies/local.strategy';
import { SessionStrategy } from './strategies/session.strategy';

// Constants and Entities

import {
  User,
  AuthenticationDetail,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  SSOProvider,
  Session,
  Setting,
} from '@attraccess/database-entities';
import { EmailModule } from '../email/email.module';
import { SSOService } from './auth/sso/sso.service';
import { SSOOIDCStrategy } from './auth/sso/oidc/oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SSOController } from './auth/sso/sso.controller';
import { AppConfigType } from '../config/app.config';
import { CookieConfigService } from '../common/services/cookie-config.service';
import { LicenseModule } from '../license/license.module';
import { SSOOIDCGuard } from './auth/sso/oidc/oidc.guard';
import { SSOSamlGuard } from './auth/sso/saml/saml.guard';
import { SSOSamlStrategy } from './auth/sso/saml/saml.strategy';
import { EncryptionModule } from '../encryption/encryption.module';
import { SSOLinkTokenService } from './auth/sso/link-token.service';
import { AccountLinkingExceptionFilter } from './auth/sso/oidc/account-linking.exception-filter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuthenticationDetail,
      SSOProvider,
      SSOProviderOIDCConfiguration,
      SSOProviderSAMLConfiguration,
      Session,
      Setting,
    ]),
    PassportModule,
    EmailModule,
    EncryptionModule,
    LicenseModule,
  ],
  providers: [
    UsersService,
    AuthService,
    SessionService,
    LocalStrategy,
    SessionStrategy,
    SSOService,
    CookieConfigService,
    SSOOIDCGuard,
    SSOSamlGuard,
    SSOLinkTokenService,
    AccountLinkingExceptionFilter,
    {
      provide: SSOOIDCStrategy,
      useFactory: (moduleRef: ModuleRef, configService: ConfigService) => {
        // This is a placeholder - you'll need to retrieve an actual configuration
        // from the database or environment variables
        const config = new SSOProviderOIDCConfiguration();
        config.issuer = 'placeholder';
        config.authorizationURL = 'placeholder';
        config.tokenURL = 'placeholder';
        config.userInfoURL = 'placeholder';
        config.clientId = 'placeholder';
        config.clientSecret = 'placeholder';

        const appConfig = configService.get<AppConfigType>('app');
        if (!appConfig) {
          throw new Error("App configuration ('app') not found.");
        }
        const callbackURL = appConfig.ATTRACCESS_FRONTEND_URL + '/api/sso/OIDC/callback';

        return new SSOOIDCStrategy(moduleRef, config, callbackURL);
      },
      inject: [ModuleRef, ConfigService],
    },
    {
      provide: SSOSamlStrategy,
      useFactory: (moduleRef: ModuleRef, configService: ConfigService) => {
        const config = new SSOProviderSAMLConfiguration();
        config.entryPoint = 'https://placeholder';
        config.issuer = 'placeholder';
        config.certificate = 'PLACEHOLDER_CERT';
        config.wantAssertionsSigned = false;
        config.wantAuthnResponseSigned = true;
        config.forceAuthn = false;
        config.signRequest = false;
        config.ssoProviderId = 0;

        const appConfig = configService.get<AppConfigType>('app');
        if (!appConfig) {
          throw new Error("App configuration ('app') not found.");
        }
        const callbackURL = appConfig.ATTRACCESS_FRONTEND_URL + '/api/sso/SAML/callback';

        return new SSOSamlStrategy(moduleRef, config, callbackURL);
      },
      inject: [ModuleRef, ConfigService],
    },
  ],
  controllers: [UsersController, AuthController, SSOController],
  exports: [UsersService, AuthService, SessionService],
})
export class UsersAndAuthModule {}
