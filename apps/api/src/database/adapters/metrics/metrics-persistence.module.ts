import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttractapCrashReport,
  MqttServer,
  Project,
  Resource,
  ResourceGroup,
  ResourceUsage,
  Session,
  User,
} from '@attraccess/database-entities';
import { GAUGE_COUNT_READER, RESET_REPORT_COUNT_READER } from '../../../metrics/metrics-readers.port';
import { TypeOrmGaugeCountReader, TypeOrmResetReportCountReader } from './typeorm-metrics-readers';

/**
 * Persistence of the metrics area: the count queries behind the gauges. The engine hook that times every query
 * (db.instrumentation.ts in this folder) is provided by the MetricsModule, which owns the metric definitions.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Resource,
      Project,
      ResourceGroup,
      MqttServer,
      ResourceUsage,
      Session,
      AttractapCrashReport,
    ]),
  ],
  providers: [
    { provide: GAUGE_COUNT_READER, useClass: TypeOrmGaugeCountReader },
    { provide: RESET_REPORT_COUNT_READER, useClass: TypeOrmResetReportCountReader },
  ],
  exports: [GAUGE_COUNT_READER, RESET_REPORT_COUNT_READER],
})
export class MetricsPersistenceModule {}
