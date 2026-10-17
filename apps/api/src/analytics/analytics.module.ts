import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingIntervalModule } from '../resources/operating-intervals/resource-operating-interval.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceUsage, BillingTransaction]), ResourceOperatingIntervalModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
