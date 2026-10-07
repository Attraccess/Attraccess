import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperatingRangeAttributionImplementation } from './operating-range-attribution';

@Injectable()
export class ResourceOperatingAttributionService extends OperatingRangeAttributionImplementation {
  constructor(
    @InjectRepository(ResourceOperatingInterval)
    protected readonly intervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceUsage)
    protected readonly usageRepository: Repository<ResourceUsage>,
    @InjectRepository(ResourceUsageLifecycleAttempt)
    protected readonly lifecycleAttemptRepository: Repository<ResourceUsageLifecycleAttempt>,
  ) {
    super();
  }
}

export {
  ResourceDurations,
  ResourceDurationWindow,
  ResourceOperatingAttribution,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service.feature-definitions';
