import { AppController } from './app.controller';
import { AuditModule } from '../audit/audit.module';
import { AppService } from './app.service';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceConfig } from '../database/datasource';
import { ResourcesModule } from '../resources/resources.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import storageConfigObject, { StorageConfigType } from '../config/storage.config';
import appConfiguration from '../config/app.config';
import { AppConfigType } from '../config/app.config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Module, OnModuleInit } from '@nestjs/common';
import { PluginModule } from '../plugin-system/plugin.module';
import { AttractapModule } from '../attractap/attractap.module';
import { CompanionModule } from '../companion/companion.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EmailTemplateModule } from '../email-template/email-template.module';
import { EmailLayoutModule } from '../email-layout/email-layout.module';
import sessionConfig from '../config/session.config';
import valkeyConfig from '../config/valkey.config';
import { ValkeyModule } from '../valkey/valkey.module';
import { LicenseModule } from '../license/license.module';
import { LicenseService } from '../license/license.service';
import { BillingModule } from '../billing/billing.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { ProjectsModule } from '../projects/projects.module';
import { SettingsModule } from '../settings/settings.module';
import { SettingsService } from '../settings/settings.service';
import { MetricsModule } from '../metrics/metrics.module';
import { VersionModule } from '../version/version.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PushModule } from '../push/push.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfiguration, storageConfigObject, sessionConfig, valkeyConfig],
      isGlobal: true,
    }),

    ValkeyModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    UsersAndAuthModule,
    SettingsModule,
    TypeOrmModule.forRoot(dataSourceConfig),
    AuditModule,
    ResourcesModule,
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfigType>('app');
        if (!appConfig || !appConfig.STATIC_DOCS_FILE_PATH) {
          // eslint-disable-next-line no-console
          console.error('STATIC_DOCS_FILE_PATH not configured. Docs will not be served.');
          return [];
        }
        const resolvedDocsPath = resolve(appConfig.STATIC_DOCS_FILE_PATH);

        // eslint-disable-next-line no-console
        console.log('Serving docs from (via config): ', resolvedDocsPath);

        return [
          {
            rootPath: resolvedDocsPath,
            serveRoot: '/docs',
            renderPath: '/__docs_noop__',
          },
        ];
      },
    }),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const storageConfig = configService.get<StorageConfigType>('storage');
        if (!storageConfig || !storageConfig.cdn.root) {
          // eslint-disable-next-line no-console
          console.error('CDN_ROOT not configured. CDN will not be served.');
          return [];
        }

        const cdnRoot = resolve(storageConfig.cdn.root);
        // eslint-disable-next-line no-console
        console.log('Serving cdn files from (via config): ', cdnRoot);
        return [
          {
            rootPath: cdnRoot,
            serveRoot: storageConfig.cdn.serveRoot,
          },
        ];
      },
    }),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfigType>('app');
        if (!appConfig || !appConfig.STATIC_FRONTEND_FILE_PATH) {
          // eslint-disable-next-line no-console
          console.error('STATIC_FRONTEND_FILE_PATH not configured. Frontend will not be served.');
          return [];
        }
        const resolvedFrontendPath = resolve(appConfig.STATIC_FRONTEND_FILE_PATH);
        // eslint-disable-next-line no-console
        console.log('Serving frontend from (via config): ', resolvedFrontendPath);
        return [
          {
            rootPath: resolvedFrontendPath,
            exclude: ['/api/{*path}', '/docs/{*path}', '/cdn/{*path}'],
          },
        ];
      },
    }),
    MetricsModule,
    VersionModule,
    PluginModule.forRoot(),
    AttractapModule,
    CompanionModule,
    AnalyticsModule,
    EmailTemplateModule,
    EmailLayoutModule,
    LicenseModule,
    BillingModule,
    EncryptionModule,
    ProjectsModule,
    MessagingModule,
    PushModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly licenseService: LicenseService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    try {
      const licenseKey = await this.settingsService.getLicenseKey();
      if (!licenseKey) {
        // eslint-disable-next-line no-console
        console.warn('LICENSE_KEY not configured yet. Skipping initial license validation.');
        return;
      }

      await this.licenseService.verifyLicense();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    }
  }
}
