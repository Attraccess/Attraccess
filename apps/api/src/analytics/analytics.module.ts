import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CsvExportTemplatesController } from './csv-export-templates.controller';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, CsvExportTemplate, ResourceUsage } from '@attraccess/database-entities';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceUsage, BillingTransaction, CsvExportTemplate])],
  controllers: [AnalyticsController, CsvExportTemplatesController],
  providers: [AnalyticsService, CsvExportTemplatesService],
})
export class AnalyticsModule {}
