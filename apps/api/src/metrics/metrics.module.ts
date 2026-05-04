import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Resource, Project, ResourceGroup, MqttServer, ResourceUsage, Session } from '@attraccess/database-entities';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsGuard } from './metrics.guard';
import { SettingsModule } from '../settings/settings.module';
import { MetricsToggleService } from './settings/metrics-toggle.service';
import {
  HTTP_METRICS,
  WS_METRICS,
  CRON_METRICS,
  DB_METRICS,
  EXTERNAL_METRICS,
  SSE_METRICS,
  FLOW_METRICS,
} from './definitions/tokens';
import { createHttpMetrics } from './definitions/http.metrics';
import { createWsMetrics } from './definitions/ws.metrics';
import { createCronMetrics } from './definitions/cron.metrics';
import { createDbMetrics } from './definitions/db.metrics';
import { createExternalMetrics } from './definitions/external.metrics';
import { createSseMetrics } from './definitions/sse.metrics';
import { createFlowMetrics } from './definitions/flow.metrics';
import { HttpMetricsInterceptor } from './instrumentation/http/http.interceptor';
import { WsMetricsInterceptor } from './instrumentation/ws/ws.interceptor';
import { CronTimer } from './instrumentation/cron/cron.helper';
import { DbMetricsSubscriber } from './instrumentation/db/db.subscriber';
import { ExternalCallTimer } from './instrumentation/external/external.helper';
import { SseInstrumentation } from './instrumentation/sse/sse.helper';

const definitionProviders = [
  { provide: HTTP_METRICS, useFactory: (m: MetricsService) => createHttpMetrics(m.registry), inject: [MetricsService] },
  { provide: WS_METRICS, useFactory: (m: MetricsService) => createWsMetrics(m.registry), inject: [MetricsService] },
  { provide: CRON_METRICS, useFactory: (m: MetricsService) => createCronMetrics(m.registry), inject: [MetricsService] },
  { provide: DB_METRICS, useFactory: (m: MetricsService) => createDbMetrics(m.registry), inject: [MetricsService] },
  { provide: EXTERNAL_METRICS, useFactory: (m: MetricsService) => createExternalMetrics(m.registry), inject: [MetricsService] },
  { provide: SSE_METRICS, useFactory: (m: MetricsService) => createSseMetrics(m.registry), inject: [MetricsService] },
  { provide: FLOW_METRICS, useFactory: (m: MetricsService) => createFlowMetrics(m.registry), inject: [MetricsService] },
];

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
    MetricsToggleService,
    CronTimer,
    DbMetricsSubscriber,
    ExternalCallTimer,
    SseInstrumentation,
    ...definitionProviders,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: WsMetricsInterceptor,
    },
  ],
  exports: [
    MetricsService,
    MetricsToggleService,
    CronTimer,
    ExternalCallTimer,
    SseInstrumentation,
    HTTP_METRICS,
    WS_METRICS,
    CRON_METRICS,
    DB_METRICS,
    EXTERNAL_METRICS,
    SSE_METRICS,
    FLOW_METRICS,
  ],
})
export class MetricsModule {}
