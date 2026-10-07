import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MetricsService } from '../../metrics/metrics.service';

export interface GetOneSearchOptions {
  id: number;
}

export interface GroupVisibilityContext {
  userId: number;
  canUpdateResources: boolean;
}

export abstract class ResourceGroupsServiceRouteContext {
  protected abstract readonly resourceIntroducerRepository: Repository<ResourceIntroducer>;
  protected abstract readonly resourceIntroductionRepository: Repository<ResourceIntroduction>;
  protected abstract readonly resourceGroupRepository: Repository<ResourceGroup>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract readonly metricsService: MetricsService;
  protected abstract readonly audit: AuditService;
  public abstract getOne(
    searchOptions: GetOneSearchOptions,
    relations?: string[],
    visibility?: GroupVisibilityContext,
  ): Promise<ResourceGroup>;
  protected abstract readonly resourceRepository: Repository<Resource>;
}
