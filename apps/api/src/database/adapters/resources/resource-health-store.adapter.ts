import { Injectable, Optional, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Like } from 'typeorm';
import { Resource, ResourceHealthState } from '@attraccess/database-entities';
import {
  ResourceHealthStatus,
  type ResourceHealthRecord,
  type ResourceHealthSource,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type { HealthReport, ResourceHealthStore } from '../../../resources/health/resource-health-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';

const toRecord = (entity: ResourceHealthState): ResourceHealthRecord => ({
  id: entity.id,
  resourceId: entity.resourceId,
  identifier: entity.identifier,
  status: entity.status,
  reason: entity.reason,
  source: entity.source,
  lastReportedAt: entity.lastReportedAt,
});

@Injectable()
export class TypeOrmResourceHealthStore implements ResourceHealthStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private get repository() {
    return this.dataSource.getRepository(ResourceHealthState);
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async upsertReport(
    report: HealthReport,
  ): Promise<{ record: ResourceHealthRecord; previousStatus: ResourceHealthStatus | null }> {
    const existing = await this.repository.findOne({
      where: { resourceId: report.resourceId, identifier: report.identifier },
    });
    const previousStatus = existing?.status ?? null;
    const saved = existing
      ? await this.repository.save(Object.assign(existing, report))
      : await this.repository.save(this.repository.create(report));
    return { record: toRecord(saved), previousStatus };
  }

  async listForResource(resourceId: number): Promise<ResourceHealthRecord[]> {
    const rows = await this.repository.find({ where: { resourceId }, order: { identifier: 'ASC' } });
    return rows.map(toRecord);
  }

  async listForResources(resourceIds: number[]): Promise<ResourceHealthRecord[]> {
    const rows = await this.repository.find({
      where: { resourceId: In(resourceIds) },
      order: { identifier: 'ASC' },
    });
    return rows.map(toRecord);
  }

  async listBySourceAndPrefix(
    source: ResourceHealthSource,
    identifierPrefix: string,
    resourceId?: number,
  ): Promise<ResourceHealthRecord[]> {
    const rows = await this.repository.find({
      where: {
        source,
        identifier: Like(`${identifierPrefix.replace(/[\\%_]/g, '\\$&')}%`),
        ...(resourceId === undefined ? {} : { resourceId }),
      },
      order: { resourceId: 'ASC', identifier: 'ASC' },
    });
    return rows.filter((row) => row.identifier.startsWith(identifierPrefix)).map(toRecord);
  }

  async hasUnhealthyEntry(resourceId: number, context?: ResourcePersistenceContext): Promise<boolean> {
    const count = await managerFor(context, this.dataSource.manager, this.unitOfWork)
      .getRepository(ResourceHealthState)
      .count({ where: { resourceId, status: ResourceHealthStatus.UNHEALTHY } });
    return count > 0;
  }

  async findEntry(resourceId: number, entryId: number): Promise<ResourceHealthRecord | null> {
    const entity = await this.repository.findOne({ where: { id: entryId, resourceId } });
    return entity ? toRecord(entity) : null;
  }

  async removeEntry(entryId: number): Promise<void> {
    await this.repository.delete({ id: entryId });
  }
}
