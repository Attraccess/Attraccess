import { SettingsService } from './settings/settings.service';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
import { AppConfigType } from './config/app.config';

export async function configureBootstrapApi(
  app: NestExpressApplication,
  appConfig: AppConfigType,
  skipDatabaseMigrations: boolean,
  bootstrapLogger: Logger,
) {
  const globalPrefix = appConfig.GLOBAL_PREFIX;
  app.setGlobalPrefix(globalPrefix);

  app.useWebSocketAdapter(new WsAdapter(app));

  const appUrl = skipDatabaseMigrations ? appConfig.ATTRACCESS_URL : await app.get(SettingsService).getUrl();

  // Session middleware is used for SAML SSO state persistence only (not for regular auth).
  // OIDC state is handled by OidcCookieStateStore (a signed oidc-state cookie) instead.
  // Cookie is explicitly SameSite=Lax so it survives IdP redirects (cross-site top-level navigations).
  app.use(
    session({
      secret: appConfig.AUTH_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        sameSite: 'lax', // must be lax — strict would block SAML IdP redirect callbacks
        secure: appUrl?.startsWith('https://') ?? false,
        httpOnly: true,
      },
    }),
  );

  bootstrapLogger.log(`🚀 Application is running with global prefix: ${globalPrefix}`);
  bootstrapLogger.log(`📝 Enabled log levels: ${appConfig.LOG_LEVELS.join(', ')}`);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get('Reflector')));

  const config = new DocumentBuilder()
    .setTitle('Attraccess API')
    .setDescription('The Attraccess API used to manage machine and tool access in a Makerspace or FabLab')
    .setVersion(appConfig.VERSION)
    .addBearerAuth()
    .addApiKey({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    })
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  return { globalPrefix, documentFactory };
}
