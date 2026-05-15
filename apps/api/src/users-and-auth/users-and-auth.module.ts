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
import { OidcCookieStateStore } from './auth/sso/oidc/oidc-cookie-state-store';
import { SSOSamlGuard } from './auth/sso/saml/saml.guard';
import { SSOSamlStrategy } from './auth/sso/saml/saml.strategy';
import { EncryptionModule } from '../encryption/encryption.module';
import { SSOLinkTokenService } from './auth/sso/link-token.service';
import { AccountLinkingExceptionFilter } from './auth/sso/oidc/account-linking.exception-filter';
import { TwoFactorService } from './auth/two-factor.service';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { BruteForceProtectionService } from './rate-limiting/brute-force.service';
import { AuthAuditLogger } from './rate-limiting/auth-audit.logger';
import { AuthRateLimitInterceptor } from './rate-limiting/auth-rate-limit.interceptor';
import { LoginRateLimitGuard } from './rate-limiting/login.rate-limit.guard';
import { PasswordPolicyModule } from './password-policy/password-policy.module';

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
    PasswordPolicyModule,
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
    OidcCookieStateStore,
    SSOOIDCGuard,
    SSOSamlGuard,
    SSOSamlStrategy,
    SSOLinkTokenService,
    AccountLinkingExceptionFilter,
    BruteForceProtectionService,
    AuthAuditLogger,
    AuthRateLimitInterceptor,
    LoginRateLimitGuard,
    {
      provide: SSOOIDCStrategy,
      useFactory: async (moduleRef: ModuleRef, settingsService: SettingsService, stateStore: OidcCookieStateStore) => {
        // Placeholder config; actual OIDC providers are resolved at request time
        const config = new SSOProviderOIDCConfiguration();
        config.issuer = 'placeholder';
        config.authorizationURL = 'placeholder';
        config.tokenURL = 'placeholder';
        config.userInfoURL = 'placeholder';
        config.clientId = 'placeholder';
        config.clientSecret = 'placeholder';

        const appUrl = await settingsService.getUrl();
        // Use fallback during first-time setup when no settings exist; real callback is only needed when OIDC is used
        const callbackURL = appUrl
          ? appUrl.replace(/\/$/, '') + '/api/sso/OIDC/callback'
          : 'http://localhost:3000/api/sso/OIDC/callback';

        return new SSOOIDCStrategy(moduleRef, config, callbackURL, stateStore);
      },
      inject: [ModuleRef, SettingsService, OidcCookieStateStore],
    },
  ],
  controllers: [UsersController, AuthController, TwoFactorController, SSOController],
  exports: [UsersService, AuthService, SessionService, BruteForceProtectionService, AuthAuditLogger],
})
export class UsersAndAuthModule {}
