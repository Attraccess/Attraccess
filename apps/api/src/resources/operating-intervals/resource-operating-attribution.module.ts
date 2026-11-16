import { Module } from '@nestjs/common';
import { OperatingIntervalsPersistenceModule } from '../../database/adapters/operating-intervals/operating-intervals-persistence.module';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';

/** Authoritative duration reads shared by reporting, billing, and maintenance. */
@Module({
  imports: [OperatingIntervalsPersistenceModule],
  providers: [ResourceOperatingAttributionService],
  exports: [ResourceOperatingAttributionService],
})
export class ResourceOperatingAttributionModule {}
