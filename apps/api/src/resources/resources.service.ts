import { Resource } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { LicenseService } from '../license/license.service';
import { MetricsService } from '../metrics/metrics.service';
import { ResourceListingImplementation } from './resource-listing';
import { ResourceImageService } from './resourceImage.service';

@Injectable()
export class ResourcesService extends ResourceListingImplementation {
  protected readonly logger = new Logger(ResourcesService.name);

  constructor(
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    protected readonly resourceImageService: ResourceImageService,
    protected readonly licenseService: LicenseService,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  async getResourceById<Tid extends number | number[]>(
    idOrArrayOfIds: Tid,
  ): Promise<Tid extends number ? Resource | null : Resource[]> {
    const arrayOfIds: number[] = Array.isArray(idOrArrayOfIds) ? idOrArrayOfIds : [idOrArrayOfIds];

    if (arrayOfIds.length === 0) {
      return (typeof idOrArrayOfIds === 'number' ? null : ([] as Resource[])) as Tid extends number
        ? Resource | null
        : Resource[];
    }

    const resources = await this.resourceRepository.find({
      where: { id: In(arrayOfIds) },
      relations: ['introductions', 'usages', 'groups'],
    });

    if (resources.length !== arrayOfIds.length) {
      throw new ResourceNotFoundException(arrayOfIds.find((id) => !resources.some((resource) => resource.id === id)));
    }

    return (typeof idOrArrayOfIds === 'number' ? resources[0] : resources) as Tid extends number
      ? Resource
      : Resource[];
  }
}
