import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';

// Services and Controllers
import { UsersService } from './users/users.service';
import { UsersRegistrationController } from './users/users-registration.controller';
import { UserInvitationsController } from './users/user-invitations.controller';
import { UserProfileController } from './users/user-profile.controller';
import { UsersAdminController } from './users/users-admin.controller';
import { UserPermissionsController } from './users/user-permissions.controller';
import { SignupDomainService } from './users/signup-domain.service';
import { UserRegistrationService } from './users/user-registration.service';
import { UserPasswordService } from './users/user-password.service';
import { UserInvitationService } from './users/user-invitation.service';
import { UserPermissionsService } from './users/user-permissions.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { TwoFactorController } from './auth/two-factor.controller';
import { SessionService } from './auth/session.service';
import { SESSION_STORE, SessionStore } from './auth/session-store/session-store';
import { SqliteSessionStore } from './auth/session-store/sqlite.session-store';
import { ValkeySessionStore } from './auth/session-store/valkey.session-store';
import { VALKEY_CLIENT } from '../valkey/valkey.module';
import { TokenHashService } from '../encryption/token-hash.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Redis } from 'ioredis';

// Strategies
import { LocalStrategy } from './strategies/local.strategy';
import { SessionStrategy } from './strategies/session.strategy';

import { RbacModule } from './rbac/rbac.module';
import { RbacController } from './rbac/rbac.controller';

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
  Passkey,
  PasskeyChallenge,
  ApiToken,
  Permission,
} from '@attraccess/database-entities';
import { EmailModule } from '../email/email.module';
import { SSOService } from './auth/sso/sso.service';
import { SSOOIDCStrategy } from './auth/sso/oidc/oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { SSOController } from './auth/sso/sso.controller';
import { CookieConfigService } from '../common/services/cookie-config.service';
import { LicenseModule } from '../license/license.module';
import { SSOOIDCGuard } from './auth/sso/oidc/oidc.guard';
import { SSOOIDCPassportGuard } from './auth/sso/oidc/oidc-passport.guard';
import { OidcCookieStateStore } from './auth/sso/oidc/oidc-cookie-state-store';
import { SSOSamlGuard } from './auth/sso/saml/saml.guard';
import { SSOSamlPassportGuard } from './auth/sso/saml/saml-passport.guard';
import { SSOSamlStrategy } from './auth/sso/saml/saml.strategy';
import { EncryptionModule } from '../encryption/encryption.module';
import { SSOLinkTokenService } from './auth/sso/link-token.service';
import { AccountLinkingExceptionFilter } from './auth/sso/oidc/account-linking.exception-filter';
import { TwoFactorService } from './auth/two-factor.service';
import { PasskeyService } from './auth/passkey/passkey.service';
import { PasskeyController } from './auth/passkey/passkey.controller';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { BruteForceProtectionService } from './rate-limiting/brute-force.service';
import { AuthAuditLogger } from './rate-limiting/auth-audit.logger';
import { AuthRateLimitInterceptor } from './rate-limiting/auth-rate-limit.interceptor';
import { LoginRateLimitGuard } from './rate-limiting/login.rate-limit.guard';
import { PasswordPolicyModule } from './password-policy/password-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApiTokenService } from './auth/api-token/api-token.service';
import { ApiTokenController } from './auth/api-token/api-token.controller';

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
    {
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
    },
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
    LocalStrategy,
    SessionStrategy,
    SSOService,
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
    RbacController,
  ],
  exports: [UsersService, AuthService, SessionService, BruteForceProtectionService, AuthAuditLogger, RbacModule],
})
export class UsersAndAuthModule {}
