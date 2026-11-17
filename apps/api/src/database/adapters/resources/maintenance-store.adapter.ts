import { Injectable, Optional, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { Resource, ResourceIntroducer, ResourceMaintenance, User } from '@attraccess/database-entities';
import type { ResourceMaintenanceRecord } from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type {
  CreateManualMaintenanceInput,
  CreateScheduledMaintenanceInput,
  MaintenanceAccessLookup,
  MaintenancePageFilter,
  ResourceMaintenanceStore,
} from '../../../resources/maintenances/maintenance-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';
import { toMaintenanceRecord } from './maintenance-mappers';

const AUDIT_USERS = ['createdByUser', 'completedByUser'];

@Injectable()
export class TypeOrmResourceMaintenanceStore implements ResourceMaintenanceStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(context?: ResourcePersistenceContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async page(
    resourceId: number,
    filter: MaintenancePageFilter,
  ): Promise<{ data: ResourceMaintenanceRecord[]; total: number }> {
    const { includeUpcoming, includeActive, includePast, now, skip, take } = filter;
    const queryBuilder = this.dataSource
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId });

    if (!(includeUpcoming && includeActive && includePast)) {
      const conditions: string[] = [];
      if (includeUpcoming) conditions.push('maintenance.startTime > :now');
      if (includeActive) {
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NULL OR maintenance.endTime > :now))',
        );
      }
      if (includePast) {
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NOT NULL AND maintenance.endTime < :now))',
        );
      }
      if (conditions.length > 0) queryBuilder.andWhere(`(${conditions.join(' OR ')})`, { now });
    }

    queryBuilder.orderBy('maintenance.startTime', 'ASC');
    const total = await queryBuilder.getCount();
    queryBuilder
      .leftJoinAndSelect('maintenance.createdByUser', 'createdByUser')
      .leftJoinAndSelect('maintenance.completedByUser', 'completedByUser');
    const rows = await queryBuilder.skip(skip).take(take).getMany();
    return { data: rows.map(toMaintenanceRecord), total };
  }

  async findById(maintenanceId: number): Promise<ResourceMaintenanceRecord | null> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenance)
      .findOne({ where: { id: maintenanceId }, relations: AUDIT_USERS });
    return entity ? toMaintenanceRecord(entity) : null;
  }

  async findOverlapping(resourceId: number, from: Date, to: Date): Promise<ResourceMaintenanceRecord[]> {
    const rows = await this.dataSource
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId })
      .andWhere('maintenance.startTime < :to', { to })
      .andWhere('(maintenance.endTime IS NULL OR maintenance.endTime > :from)', { from })
      .orderBy('maintenance.startTime', 'ASC')
      .addOrderBy('maintenance.id', 'ASC')
      .getMany();
    return rows.map(toMaintenanceRecord);
  }

  async hasActive(
    filter: { resourceId: number; scheduleId?: number },
    now: Date,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    const query = this.manager(context)
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId: filter.resourceId })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL');
    if (filter.scheduleId) {
      query.andWhere('maintenance.maintenanceScheduleId = :scheduleId', { scheduleId: filter.scheduleId });
    }
    return !!(await query.getOne());
  }

  async activeResourceIds(resourceIds: number[], now: Date): Promise<Set<number>> {
    const active = await this.dataSource
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .select('DISTINCT maintenance.resourceId', 'resourceId')
      .where('maintenance.resourceId IN (:...resourceIds)', { resourceIds })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL')
      .getRawMany<{ resourceId: number }>();
    return new Set(active.map((row) => Number(row.resourceId)));
  }

  async introducerManagedResourceIds(
    userId: number,
    resourceIds: number[],
    context?: ResourcePersistenceContext,
  ): Promise<Set<number>> {
    const matches = await this.manager(context)
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .leftJoin('introducer.resource', 'resource')
      .leftJoin('introducer.resourceGroup', 'resourceGroup')
      .leftJoin('resourceGroup.resources', 'groupResource')
      .select('resource.id', 'resourceId')
      .addSelect('groupResource.id', 'groupResourceId')
      .where('introducer.userId = :userId', { userId })
      .andWhere('(resource.id IN (:...resourceIds) OR groupResource.id IN (:...resourceIds))', { resourceIds })
      .getRawMany<{ resourceId: number | null; groupResourceId: number | null }>();

    return new Set(
      matches.flatMap((match) =>
        [match.resourceId, match.groupResourceId].filter((id): id is number => id != null).map(Number),
      ),
    );
  }

  async lookupMaintenanceAccess(
    userId: number,
    resourceId: number,
    context?: ResourcePersistenceContext,
  ): Promise<MaintenanceAccessLookup> {
    const manager = this.manager(context);
    const introducers = manager.getRepository(ResourceIntroducer);

    const direct = await introducers.findOne({ where: { user: { id: userId }, resource: { id: resourceId } } });
    if (direct) return 'direct';

    const resource = await manager
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, relations: ['groups'] });
    if (!resource) return 'resource-missing';

    const group = await introducers.findOne({
      where: { user: { id: userId }, resourceGroup: { id: In(resource.groups.map((candidate) => candidate.id)) } },
    });
    return group ? 'group' : 'none';
  }

  async createManual(input: CreateManualMaintenanceInput): Promise<ResourceMaintenanceRecord> {
    const repository = this.dataSource.getRepository(ResourceMaintenance);
    const saved = await repository.save(
      repository.create({
        resource: { id: input.resourceId } as Resource,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
        createdByUser: input.createdByUserId != null ? ({ id: input.createdByUserId } as User) : undefined,
      }),
    );
    return this.reload(saved.id);
  }

  async createFromSchedule(
    input: CreateScheduledMaintenanceInput,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceMaintenanceRecord | null> {
    const manager = this.manager(context);
    const resource = await manager.getRepository(Resource).findOne({ where: { id: input.resourceId } });
    if (!resource) return null;
    const repository = manager.getRepository(ResourceMaintenance);
    const saved = await repository.save(
      repository.create({
        resource,
        startTime: input.startTime,
        endTime: null,
        reason: input.reason,
        maintenanceSchedule: { id: input.scheduleId } as ResourceMaintenance['maintenanceSchedule'],
      }),
    );
    return toMaintenanceRecord(saved);
  }

  async markFinished(
    maintenanceId: number,
    completedAt: Date,
    completedByUserId?: number,
  ): Promise<ResourceMaintenanceRecord> {
    const repository = this.dataSource.getRepository(ResourceMaintenance);
    const maintenance = await repository.findOneByOrFail({ id: maintenanceId });
    maintenance.endTime = completedAt;
    maintenance.completedAt = completedAt;
    if (completedByUserId != null) maintenance.completedByUser = { id: completedByUserId } as User;
    await repository.save(maintenance);
    return this.reload(maintenanceId);
  }

  private async reload(maintenanceId: number): Promise<ResourceMaintenanceRecord> {
    const entity = await this.dataSource
      .getRepository(ResourceMaintenance)
      .findOneOrFail({ where: { id: maintenanceId }, relations: AUDIT_USERS });
    return toMaintenanceRecord(entity);
  }
}
