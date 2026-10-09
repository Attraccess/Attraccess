import { SsoLogoutService } from './auth/sso/sso-logout.service';
import { SsoLogoutController } from './auth/sso/sso-logout.controller';
import { OidcTokenVerifier } from './auth/sso/oidc/oidc-token-verifier.service';
import { Module } from '@nestjs/common';

import { PassportModule } from '@nestjs/passport';

import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';

// Services and Controllers
import { AuthController } from './auth/auth.controller';

import { AuthService } from './auth/auth.service';

import { SessionService } from './auth/session.service';

import { TwoFactorController } from './auth/two-factor.controller';

import { SignupDomainService } from './users/signup-domain.service';

import { UserInvitationService } from './users/user-invitation.service';

import { UserInvitationsController } from './users/user-invitations.controller';

import { UserPasswordService } from './users/user-password.service';

import { UserPermissionsController } from './users/user-permissions.controller';

import { UserPermissionsService } from './users/user-permissions.service';

import { UserProfileController } from './users/user-profile.controller';

import { UserRegistrationService } from './users/user-registration.service';

import { UsersAdminController } from './users/users-admin.controller';

import { UsersRegistrationController } from './users/users-registration.controller';

import { UsersService } from './users/users.service';

// Strategies
import { LocalStrategy } from './strategies/local.strategy';

import { SessionStrategy } from './strategies/session.strategy';

import { RbacController } from './rbac/rbac.controller';

import { RbacModule } from './rbac/rbac.module';

// Constants and Entities

import {
  ApiToken,
  ApiTokenPermission,
  AuthenticationDetail,
  Passkey,
  PasskeyChallenge,
  Permission,
  ResourceUsage,
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderSAMLConfiguration,
  Session,
  Setting,
  User,
} from '@attraccess/database-entities';

import { APP_INTERCEPTOR, ModuleRef } from '@nestjs/core';

import { CookieConfigService } from '../common/services/cookie-config.service';

import { EmailModule } from '../email/email.module';

import { EncryptionModule } from '../encryption/encryption.module';

import { LicenseModule } from '../license/license.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { SettingsModule } from '../settings/settings.module';

import { SettingsService } from '../settings/settings.service';

import { ApiTokenRequestRateLimitInterceptor } from './auth/api-token/api-token-request-rate-limit.interceptor';

import { ApiTokenRequestRateLimitService } from './auth/api-token/api-token-request-rate-limit.service';

import { ApiTokenController } from './auth/api-token/api-token.controller';

import { ApiTokenService } from './auth/api-token/api-token.service';

import { PasskeyController } from './auth/passkey/passkey.controller';

import { PasskeyService } from './auth/passkey/passkey.service';

import { SSOLinkTokenService } from './auth/sso/link-token.service';

import { AccountLinkingExceptionFilter } from './auth/sso/oidc/account-linking.exception-filter';

import { OidcCookieStateStore } from './auth/sso/oidc/oidc-cookie-state-store';

import { SSOOIDCPassportGuard } from './auth/sso/oidc/oidc-passport.guard';

import { SSOOIDCGuard } from './auth/sso/oidc/oidc.guard';

import { SSOOIDCStrategy } from './auth/sso/oidc/oidc.strategy';

import { SSOSamlPassportGuard } from './auth/sso/saml/saml-passport.guard';

import { SSOSamlGuard } from './auth/sso/saml/saml.guard';

import { SSOSamlStrategy } from './auth/sso/saml/saml.strategy';

import { SSOController } from './auth/sso/sso.controller';

import { SSOService } from './auth/sso/sso.service';

import { TwoFactorService } from './auth/two-factor.service';

import { PasswordPolicyModule } from './password-policy/password-policy.module';

import { AuthAuditLogger } from './rate-limiting/auth-audit.logger';

import { AuthRateLimitInterceptor } from './rate-limiting/auth-rate-limit.interceptor';

import { BruteForceProtectionService } from './rate-limiting/brute-force.service';

import { LoginRateLimitGuard } from './rate-limiting/login.rate-limit.guard';

import type { Redis } from 'ioredis';

import { Repository } from 'typeorm';

import { TokenHashService } from '../encryption/token-hash.service';

import { VALKEY_CLIENT } from '../valkey/valkey.module';

import { SESSION_STORE, SessionStore } from './auth/session-store/session-store';

import { SqliteSessionStore } from './auth/session-store/sqlite.session-store';

import { ValkeySessionStore } from './auth/session-store/valkey.session-store';

export const sessionStoreProvider = {
  provide: SESSION_STORE,
  inject: [
    { token: VALKEY_CLIENT, optional: true },
    getRepositoryToken(Session),
    getRepositoryToken(User),
    TokenHashService,
  ],
  useFactory: (
    valkeyClient: Redis | null,
    sessionRepo: Repository<Session>,
    userRepo: Repository<User>,
    tokenHashService: TokenHashService,
  ): SessionStore => {
    if (valkeyClient) {
      return new ValkeySessionStore(valkeyClient, userRepo, tokenHashService);
    }
    return new SqliteSessionStore(sessionRepo, tokenHashService);
  },
};

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
      Passkey,
      PasskeyChallenge,
      ApiToken,
      ApiTokenPermission,
      Permission,
    ]),
    PassportModule,
    EmailModule,
    EncryptionModule,
    LicenseModule,
    SettingsModule,
    PasswordPolicyModule,
    NotificationsModule,
    RbacModule,
  ],
  providers: [
    sessionStoreProvider,
    UsersService,
    SignupDomainService,
    UserRegistrationService,
    UserPasswordService,
    UserInvitationService,
    UserPermissionsService,
    AuthService,
    SessionService,
    TwoFactorService,
    PasskeyService,
    ApiTokenService,
    ApiTokenRequestRateLimitService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiTokenRequestRateLimitInterceptor,
    },
    LocalStrategy,
    SessionStrategy,
    SSOService,
    SsoLogoutService,
    OidcTokenVerifier,
    CookieConfigService,
    OidcCookieStateStore,
    SSOOIDCGuard,
    SSOOIDCPassportGuard,
    SSOSamlGuard,
    SSOSamlPassportGuard,
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
  controllers: [
    UsersRegistrationController,
    UserInvitationsController,
    UserProfileController,
    UsersAdminController,
    UserPermissionsController,
    AuthController,
    TwoFactorController,
    PasskeyController,
    ApiTokenController,
    SSOController,
    SsoLogoutController,
    RbacController,
  ],
  exports: [UsersService, AuthService, SessionService, BruteForceProtectionService, AuthAuditLogger, RbacModule],
})
export class UsersAndAuthModule {}
