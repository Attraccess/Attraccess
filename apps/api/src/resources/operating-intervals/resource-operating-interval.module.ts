import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage]), ResourceMaintenanceModule],
  controllers: [ResourceOperatingAttributionController],
  providers: [ResourceOperatingIntervalService, ResourceOperatingAttributionService],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionService],
})
export class ResourceOperatingIntervalModule {}
