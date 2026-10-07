import { Resource, ResourceIntroducer, ResourceMaintenance } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { MaintenanceQueryImplementation } from './maintenance-query';

@Injectable()
export class ResourceMaintenanceService extends MaintenanceQueryImplementation {
  protected readonly logger = new Logger(ResourceMaintenanceService.name);

  constructor(
    @InjectRepository(ResourceMaintenance)
    protected readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    protected readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
  ) {
    super();
  }
}
