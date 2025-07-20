import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config'; // For JwtModule
import { existsSync, readFileSync } from 'fs'; // For JwtModule secret loading

// Services and Controllers
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { SessionService } from './auth/session.service';

// Strategies
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuthenticationDetail, RevokedToken, SSOProvider, SSOProviderOIDCConfiguration, Session]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const appConfig = configService.get<AppConfigType>('app');
        if (!appConfig) {
          // Consider throwing a more specific error or logging
          throw new Error("App configuration ('app') for JWT not found.");
        }

        let jwtSecret: string;
        const jwtSecretOrigin = appConfig.AUTH_JWT_ORIGIN;

        if (jwtSecretOrigin === 'FILE') {
          const jwtKeyPath = appConfig.AUTH_JWT_SECRET; // Path from config
          if (!existsSync(jwtKeyPath)) {
            throw new Error(`JWT secret file (path from AUTH_JWT_SECRET in config) does not exist at ${jwtKeyPath}`);
          }
          jwtSecret = readFileSync(jwtKeyPath).toString().trim();
          if (!jwtSecret) {
            throw new Error(`JWT secret file at ${jwtKeyPath} is empty`);
          }
        } else if (jwtSecretOrigin === 'ENV') {
          jwtSecret = appConfig.AUTH_JWT_SECRET; // Secret string from config
          if (!jwtSecret) {
            throw new Error('AUTH_JWT_SECRET (as secret value) is not set in config for JWT (origin ENV)');
          }
        } else {
          // This case should ideally be prevented by Zod validation on AUTH_JWT_ORIGIN
          throw new Error(`Unknown JWT secret origin in config: ${jwtSecretOrigin}`);
        }

        return {
          secret: jwtSecret,
          signOptions: { expiresIn: '14d' },
        };
      },
      inject: [ConfigService],
    }),
    EmailModule,
  ],
  providers: [
    UsersService,
    AuthService,
    SessionService,
    LocalStrategy,
    JwtStrategy,
    SessionStrategy,
    SSOService,
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
        const callbackURL = appConfig.FRONTEND_URL + '/api/sso/OIDC/callback';

        return new SSOOIDCStrategy(moduleRef, config, callbackURL);
      },
      inject: [ModuleRef, ConfigService],
    },
  ],
  controllers: [UsersController, AuthController, SSOController],
  exports: [UsersService, AuthService, SessionService],
})
export class UsersAndAuthModule {}
