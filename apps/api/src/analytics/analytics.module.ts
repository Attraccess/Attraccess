import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CsvExportTemplatesController } from './csv-export-templates.controller';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, CsvExportTemplate, Resource, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingIntervalModule } from '../resources/operating-intervals/resource-operating-interval.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceUsage, BillingTransaction, CsvExportTemplate, Resource]),
    ResourceOperatingIntervalModule,
  ],
  controllers: [AnalyticsController, CsvExportTemplatesController],
  providers: [AnalyticsService, CsvExportTemplatesService],
})
export class AnalyticsModule {}
