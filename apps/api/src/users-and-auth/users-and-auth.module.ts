import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

// Services and Controllers
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { TwoFactorController } from './auth/two-factor.controller';
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
  ResourceUsage,
  Setting,
} from '@attraccess/database-entities';
import { EmailModule } from '../email/email.module';
import { SSOService } from './auth/sso/sso.service';
import { SSOOIDCStrategy } from './auth/sso/oidc/oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { SSOController } from './auth/sso/sso.controller';
import { CookieConfigService } from '../common/services/cookie-config.service';
import { LicenseModule } from '../license/license.module';
import { SSOOIDCGuard } from './auth/sso/oidc/oidc.guard';
import { SSOSamlGuard } from './auth/sso/saml/saml.guard';
import { SSOSamlStrategy } from './auth/sso/saml/saml.strategy';
import { EncryptionModule } from '../encryption/encryption.module';
import { SSOLinkTokenService } from './auth/sso/link-token.service';
import { AccountLinkingExceptionFilter } from './auth/sso/oidc/account-linking.exception-filter';
import { TwoFactorService } from './auth/two-factor.service';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuthenticationDetail,
      SSOProvider,
      SSOProviderOIDCConfiguration,
      SSOProviderSAMLConfiguration,
      Session,
      ResourceUsage,
      Setting,
    ]),
    PassportModule,
    EmailModule,
    EncryptionModule,
    LicenseModule,
    SettingsModule,
  ],
  providers: [
    UsersService,
    AuthService,
    SessionService,
    TwoFactorService,
    LocalStrategy,
    SessionStrategy,
    SSOService,
    CookieConfigService,
    SSOOIDCGuard,
    SSOSamlGuard,
    SSOSamlStrategy,
    SSOLinkTokenService,
    AccountLinkingExceptionFilter,
    {
      provide: SSOOIDCStrategy,
      useFactory: async (moduleRef: ModuleRef, settingsService: SettingsService) => {
        // Placeholder config; actual OIDC providers are resolved at request time
        const config = new SSOProviderOIDCConfiguration();
        config.issuer = 'placeholder';
        config.authorizationURL = 'placeholder';
        config.tokenURL = 'placeholder';
        config.userInfoURL = 'placeholder';
        config.clientId = 'placeholder';
        config.clientSecret = 'placeholder';

        const frontendUrl = await settingsService.getFrontendUrl();
        // Use fallback during first-time setup when no settings exist; real callback is only needed when OIDC is used
        const callbackURL = frontendUrl
          ? frontendUrl.replace(/\/$/, '') + '/api/sso/OIDC/callback'
          : 'http://localhost:4200/api/sso/OIDC/callback';

        return new SSOOIDCStrategy(moduleRef, config, callbackURL);
      },
      inject: [ModuleRef, SettingsService],
    },
  ],
  controllers: [UsersController, AuthController, TwoFactorController, SSOController],
  exports: [UsersService, AuthService, SessionService],
})
export class UsersAndAuthModule {}
