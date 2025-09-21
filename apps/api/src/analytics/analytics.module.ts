import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceUsage, BillingTransaction])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
