import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingTransaction, CsvExportTemplate, Resource, ResourceUsage } from '@attraccess/database-entities';
import { ANALYTICS_READER } from '../../../analytics/analytics-reader.port';
import { CSV_EXPORT_TEMPLATE_STORE } from '../../../analytics/csv-export-template-store.port';
import { TypeOrmAnalyticsReader } from './typeorm-analytics-reader';
import { TypeOrmCsvExportTemplateStore } from './typeorm-csv-export-template-store';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceUsage, BillingTransaction, CsvExportTemplate, Resource])],
  providers: [
    { provide: ANALYTICS_READER, useClass: TypeOrmAnalyticsReader },
    { provide: CSV_EXPORT_TEMPLATE_STORE, useClass: TypeOrmCsvExportTemplateStore },
  ],
  exports: [ANALYTICS_READER, CSV_EXPORT_TEMPLATE_STORE],
})
export class AnalyticsPersistenceModule {}
