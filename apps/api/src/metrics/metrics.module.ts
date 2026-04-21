import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Resource, Project, ResourceGroup, MqttServer, ResourceUsage, Session } from '@attraccess/database-entities';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsGuard } from './metrics.guard';
import { SettingsModule } from '../settings/settings.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Resource, Project, ResourceGroup, MqttServer, ResourceUsage, Session]),
    SettingsModule,
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
