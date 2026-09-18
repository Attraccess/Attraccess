import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceFlowNode, ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';
import { ResourceOperatingDiagnosticsController } from './resource-operating-diagnostics.controller';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage, ResourceFlowNode]),
    ResourceMaintenanceModule,
  ],
  controllers: [ResourceOperatingAttributionController, ResourceOperatingDiagnosticsController],
  providers: [ResourceOperatingIntervalService, ResourceOperatingAttributionService, ResourceOperatingDiagnosticsService],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionService, ResourceOperatingDiagnosticsService],
})
export class ResourceOperatingIntervalModule {}
