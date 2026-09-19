import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';

/** Authoritative duration reads shared by reporting, billing, and maintenance. */
@Module({
  imports: [TypeOrmModule.forFeature([ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt])],
  providers: [ResourceOperatingAttributionService],
  exports: [ResourceOperatingAttributionService],
})
export class ResourceOperatingAttributionModule {}
