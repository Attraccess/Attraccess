import { Resource } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { LicenseService } from '../license/license.service';
import { MetricsService } from '../metrics/metrics.service';
import { ResourceImageService } from './resourceImage.service';

export abstract class ResourcesServiceRouteContext {
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly licenseService: LicenseService;
  protected abstract readonly logger: Logger;
  protected abstract readonly resourceImageService: ResourceImageService;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract readonly metricsService: MetricsService;
  protected abstract readonly audit: AuditService;
  public abstract getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid,
  ): Promise<Tid extends number ? Resource | null : Resource[]>;
}
