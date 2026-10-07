import { Resource, ResourceIntroducer, ResourceMaintenance } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

export abstract class ResourceMaintenanceServiceRouteContext {
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly maintenanceRepository: Repository<ResourceMaintenance>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract readonly metricsService: MetricsService;
  public abstract emitScheduledMaintenanceCreated(resourceId: number, maintenanceId: number): void;
  protected abstract readonly rbacService: RbacService;
  protected abstract readonly resourceIntroducerRepository: Repository<ResourceIntroducer>;
  protected abstract readonly logger: Logger;
}
