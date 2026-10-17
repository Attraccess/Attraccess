import { AnalyticsPersistence } from './persistence/port';
import { TypeormAnalyticsPersistence } from './persistence/typeorm-adapter';
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingIntervalModule } from '../resources/operating-intervals/resource-operating-interval.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceUsage, BillingTransaction]), ResourceOperatingIntervalModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, { provide: AnalyticsPersistence, useClass: TypeormAnalyticsPersistence }],
})
export class AnalyticsModule {}
