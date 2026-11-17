import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource, ResourceUsage } from '@attraccess/database-entities';
import type { AttractapLinkedResource } from '@attraccess/application-models';
import { In, Repository } from 'typeorm';
import type { AttractapResourceReads } from '../../../attractap/reader-resource-reads.port';
import { activeUsageWhere } from '../../../resources/usage/sessions/active-usage';
import { toLinkedResource } from './attractap-mappers';

@Injectable()
export class TypeOrmAttractapResourceReads implements AttractapResourceReads {
  private readonly logger = new Logger(TypeOrmAttractapResourceReads.name);

  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
  ) {}

  async findResource(id: number): Promise<AttractapLinkedResource | null> {
    const resource = await this.resources.findOne({ where: { id } });
    return resource ? toLinkedResource(resource) : null;
  }

  /** Runs on every slot sync, so it reads only the resource ids. A failed read counts as idle. */
  async findResourceIdsWithActiveUsage(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    try {
      const rows = await this.usages.find({
        where: { resourceId: In(resourceIds), ...activeUsageWhere() },
        select: { resourceId: true },
      });
      return new Set(rows.map((row) => row.resourceId));
    } catch (error) {
      this.logger.warn(`Could not read active usages for resources ${resourceIds.join(',')}: ${String(error)}`);
      return new Set();
    }
  }
}
