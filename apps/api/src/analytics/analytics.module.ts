import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CsvExportTemplatesController } from './csv-export-templates.controller';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import { AnalyticsPersistenceModule } from '../database/adapters/analytics/analytics-persistence.module';
import { ResourceOperatingIntervalModule } from '../resources/operating-intervals/resource-operating-interval.module';

@Module({
  imports: [AnalyticsPersistenceModule, ResourceOperatingIntervalModule],
  controllers: [AnalyticsController, CsvExportTemplatesController],
  providers: [AnalyticsService, CsvExportTemplatesService],
})
export class AnalyticsModule {}
