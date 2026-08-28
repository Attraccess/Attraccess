import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceOperatingAttributionController } from './resource-operating-attribution.controller';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage])],
  controllers: [ResourceOperatingAttributionController],
  providers: [ResourceOperatingIntervalService, ResourceOperatingAttributionService],
  exports: [ResourceOperatingIntervalService, ResourceOperatingAttributionService],
})
export class ResourceOperatingIntervalModule {}
