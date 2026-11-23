import { Module } from '@nestjs/common';
import { OperatingIntervalsPersistenceModule } from '../../database/adapters/operating-intervals/operating-intervals-persistence.module';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionModule } from './resource-operating-attribution.module';
import { ResourceOperatingDiagnosticsController } from './resource-operating-diagnostics.controller';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [
    ResourceListVisibilityModule,
    OperatingIntervalsPersistenceModule,
    ResourceOperatingAttributionModule,
    ResourceMaintenanceModule,
  ],
  controllers: [ResourceOperatingAttributionController, ResourceOperatingDiagnosticsController],
  providers: [ResourceOperatingIntervalService, ResourceOperatingDiagnosticsService],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionModule, ResourceOperatingDiagnosticsService],
})
export class ResourceOperatingIntervalModule {}
