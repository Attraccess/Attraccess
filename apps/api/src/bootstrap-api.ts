import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { samlSession } from './saml-session';
import { AppConfigType } from './config/app.config';

export function configureBootstrapApi(app: NestExpressApplication, appConfig: AppConfigType, bootstrapLogger: Logger) {
  const globalPrefix = appConfig.GLOBAL_PREFIX;
  app.setGlobalPrefix(globalPrefix);

  app.useWebSocketAdapter(new WsAdapter(app));

  // Only SAML state uses a session; OIDC uses its own signed state cookie.
  app.use(samlSession(appConfig.AUTH_SESSION_SECRET));

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
