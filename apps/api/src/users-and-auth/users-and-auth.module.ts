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
  RevokedToken,
  SSOProviderOIDCConfiguration,
  SSOProvider,
  Session,
} from '@attraccess/database-entities';
import { EmailModule } from '../email/email.module';
import { SSOService } from './auth/sso/sso.service';
import { SSOOIDCStrategy } from './auth/sso/oidc/oidc.strategy';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SSOController } from './auth/sso/sso.controller';
import { AppConfigType } from '../config/app.config';
import { CookieConfigService } from '../common/services/cookie-config.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuthenticationDetail,
      RevokedToken,
      SSOProvider,
      SSOProviderOIDCConfiguration,
      Session,
    ]),
    PassportModule,
    EmailModule,
  ],
  providers: [
    UsersService,
    AuthService,
    SessionService,
    LocalStrategy,
    SessionStrategy,
    SSOService,
    CookieConfigService,
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
  ],
  controllers: [UsersController, AuthController, SSOController],
  exports: [UsersService, AuthService, SessionService],
})
export class UsersAndAuthModule {}
