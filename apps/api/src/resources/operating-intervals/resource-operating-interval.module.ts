import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceFlowNode, ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionModule } from './resource-operating-attribution.module';
import { ResourceOperatingDiagnosticsController } from './resource-operating-diagnostics.controller';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';
import { ResourceTransactionsModule } from '../../database/resource-transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage, ResourceFlowNode]),
    ResourceOperatingAttributionModule,
    ResourceMaintenanceModule,
    ResourceTransactionsModule,
  ],
  controllers: [ResourceOperatingAttributionController, ResourceOperatingDiagnosticsController],
  providers: [ResourceOperatingIntervalService, ResourceOperatingDiagnosticsService],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionModule, ResourceOperatingDiagnosticsService],
})
export class ResourceOperatingIntervalModule {}
