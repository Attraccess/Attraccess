import {
  MaintenanceEvaluationPersistence,
  ScheduleEvaluationPair,
  ScheduleEvaluationRow,
  MaintenanceBatchIsolationError,
} from './port';
import { MaintenancePersistence, MaintenancePageFilter, NewMaintenance } from './port';
import { ResourceIntroducer, User } from '@attraccess/database-entities';
import { MaintenanceRequestRecipients } from './port';
import { ResourceMaintenanceRequest, MaintenanceRequestStatus } from '@attraccess/database-entities';
import { MaintenanceRequestPersistence } from './port';
import {
  Resource,
  ResourceUsage,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceMaintenanceScheduleUsageHoursConfig,
  ResourceMaintenanceScheduleUsageCountConfig,
  ResourceMaintenanceScheduleTimeIntervalConfig,
  UsageDurationUnit,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, EntityManager } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { MaintenanceSchedulePersistence, NewMaintenanceSchedule } from './port';

@Injectable()
export class TypeormMaintenanceSchedulePersistence extends MaintenanceSchedulePersistence {
  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    private readonly scheduleRows: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenanceScheduleUsageHoursConfig)
    private readonly hours: Repository<ResourceMaintenanceScheduleUsageHoursConfig>,
    @InjectRepository(ResourceMaintenanceScheduleUsageCountConfig)
    private readonly counts: Repository<ResourceMaintenanceScheduleUsageCountConfig>,
    @InjectRepository(ResourceMaintenanceScheduleTimeIntervalConfig)
    private readonly intervals: Repository<ResourceMaintenanceScheduleTimeIntervalConfig>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {
    super();
  }
  async resource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId } }));
  }
  async schedules(resourceId: number): Promise<ResourceMaintenanceSchedule[]> {
    return toApplicationRecord(
      await this.scheduleRows.find({
        where: { resourceId },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
        order: { id: 'ASC' },
      }),
    );
  }
  async schedule(resourceId: number, scheduleId: number): Promise<ResourceMaintenanceSchedule | null> {
    return toApplicationRecord(
      await this.scheduleRows.findOne({
        where: { id: scheduleId, resourceId },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      }),
    );
  }
  async createSchedule(schedule: NewMaintenanceSchedule): Promise<ResourceMaintenanceSchedule> {
    return toApplicationRecord(await this.scheduleRows.save(this.scheduleRows.create(schedule)));
  }
  async saveSchedule(schedule: ResourceMaintenanceSchedule): Promise<void> {
    await this.scheduleRows.save(schedule);
  }
  async removeConfigurations(scheduleId: number): Promise<void> {
    await this.hours.delete({ scheduleId });
    await this.counts.delete({ scheduleId });
    await this.intervals.delete({ scheduleId });
  }
  async createUsageHours(scheduleId: number, duration: number, unit: UsageDurationUnit): Promise<void> {
    await this.hours.save(this.hours.create({ scheduleId, duration, unit }));
  }
  async createUsageCount(scheduleId: number, thresholdSessions: number): Promise<void> {
    await this.counts.save(this.counts.create({ scheduleId, thresholdSessions }));
  }
  async createTimeInterval(scheduleId: number, duration: number, unit: UsageDurationUnit): Promise<void> {
    await this.intervals.save(this.intervals.create({ scheduleId, duration, unit }));
  }
  async deleteAndDetachSchedule(schedule: ResourceMaintenanceSchedule): Promise<void> {
    const scheduleId = schedule.id;
    await this.scheduleRows.manager.transaction(async (manager) => {
      await manager
        .getRepository(ResourceMaintenance)
        .update({ maintenanceSchedule: { id: scheduleId } }, { maintenanceSchedule: null });
      await manager.getRepository(ResourceMaintenanceScheduleUsageHoursConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceScheduleUsageCountConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceScheduleTimeIntervalConfig).delete({ scheduleId });
      await manager.getRepository(ResourceMaintenanceSchedule).remove(schedule);
    });
  }
}

@Injectable()
export class TypeormMaintenanceRequestPersistence extends MaintenanceRequestPersistence {
  constructor(
    @InjectRepository(ResourceMaintenanceRequest) private readonly requests: Repository<ResourceMaintenanceRequest>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {
    super();
  }
  async resource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId } }));
  }
  async createRequest(
    resource: Resource,
    userId: number,
    reason: string,
    status: MaintenanceRequestStatus,
  ): Promise<ResourceMaintenanceRequest> {
    return toApplicationRecord(
      await this.requests.save(this.requests.create({ resource, reason, status, createdByUser: { id: userId } })),
    );
  }
  async requestPage(
    resourceId: number,
    page: number,
    limit: number,
    status: MaintenanceRequestStatus,
  ): Promise<[ResourceMaintenanceRequest[], number]> {
    return toApplicationRecord(
      await this.requests.findAndCount({
        where: { resourceId, status },
        relations: ['createdByUser', 'resolvedByUser', 'resultingMaintenance'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    );
  }
  async requestWithRelations(id: number): Promise<ResourceMaintenanceRequest | null> {
    return toApplicationRecord(
      await this.requests.findOne({
        where: { id },
        relations: ['createdByUser', 'resolvedByUser', 'resultingMaintenance'],
      }),
    );
  }
  async saveRequest(request: ResourceMaintenanceRequest): Promise<ResourceMaintenanceRequest> {
    return toApplicationRecord(await this.requests.save(request));
  }
}

@Injectable()
export class TypeormMaintenanceRequestRecipients extends MaintenanceRequestRecipients {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceIntroducer) private readonly introducerRows: Repository<ResourceIntroducer>,
    @InjectRepository(ResourceMaintenanceRequest) private readonly requests: Repository<ResourceMaintenanceRequest>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async requestWithAuthor(id: number): Promise<ResourceMaintenanceRequest | null> {
    return toApplicationRecord(await this.requests.findOne({ where: { id }, relations: ['createdByUser'] }));
  }
  async resourceWithGroups(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id }, relations: ['groups'] }));
  }
  async usersByIds(ids: readonly number[]): Promise<User[]> {
    if (!ids.length) return [];
    return toApplicationRecord(await this.users.findBy({ id: In([...ids]) }));
  }
  async introducers(resourceId: number, groupIds: readonly number[]): Promise<ResourceIntroducer[]> {
    return toApplicationRecord(
      await this.introducerRows.find({
        where: [{ resourceId }, ...(groupIds.length ? [{ resourceGroupId: In([...groupIds]) }] : [])],
        relations: ['user'],
      }),
    );
  }
}

export class TypeormMaintenancePersistence extends MaintenancePersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async resource(id: number, withGroups = false): Promise<Resource | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(Resource)
        .findOne({ where: { id }, ...(withGroups ? { relations: ['groups'] } : {}) }),
    );
  }
  async maintenance(id: number, withAuditUsers: boolean): Promise<ResourceMaintenance | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceMaintenance)
        .findOne({ where: { id }, ...(withAuditUsers ? { relations: ['createdByUser', 'completedByUser'] } : {}) }),
    );
  }
  async page(resourceId: number, filter: MaintenancePageFilter): Promise<[ResourceMaintenance[], number]> {
    const query = this.manager
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId });
    if (!(filter.includeUpcoming && filter.includeActive && filter.includePast)) {
      const conditions = [];
      if (filter.includeUpcoming) conditions.push('maintenance.startTime > :now');
      if (filter.includeActive)
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NULL OR maintenance.endTime > :now))',
        );
      if (filter.includePast)
        conditions.push(
          '(maintenance.startTime <= :now AND (maintenance.endTime IS NOT NULL AND maintenance.endTime < :now))',
        );
      if (conditions.length) query.andWhere(`(${conditions.join(' OR ')})`, { now: filter.now });
    }
    query.orderBy('maintenance.startTime', 'ASC');
    const total = await query.getCount();
    const data = await query
      .leftJoinAndSelect('maintenance.createdByUser', 'createdByUser')
      .leftJoinAndSelect('maintenance.completedByUser', 'completedByUser')
      .skip(filter.skip)
      .take(filter.take)
      .getMany();
    return [toApplicationRecord(data), total];
  }
  async hasActive(resourceId: number, scheduleId: number | undefined, now: Date): Promise<boolean> {
    const query = this.manager
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .where('maintenance.resourceId = :resourceId', { resourceId })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL');
    if (scheduleId) query.andWhere('maintenance.maintenanceScheduleId = :scheduleId', { scheduleId });
    return !!(await query.getOne());
  }
  async activeResourceIds(resourceIds: readonly number[], now: Date): Promise<number[]> {
    if (!resourceIds.length) return [];
    const rows = await this.manager
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('maintenance')
      .select('DISTINCT maintenance.resourceId', 'resourceId')
      .where('maintenance.resourceId IN (:...resourceIds)', { resourceIds: [...resourceIds] })
      .andWhere('maintenance.startTime <= :now', { now })
      .andWhere('maintenance.endTime IS NULL')
      .getRawMany<{ resourceId: number }>();
    return rows.map((row) => Number(row.resourceId));
  }
  managedResourcePairs(
    userId: number,
    resourceIds: readonly number[],
  ): Promise<{ resourceId: number | null; groupResourceId: number | null }[]> {
    if (!resourceIds.length) return Promise.resolve([]);
    return this.manager
      .getRepository(ResourceIntroducer)
      .createQueryBuilder('introducer')
      .leftJoin('introducer.resource', 'resource')
      .leftJoin('introducer.resourceGroup', 'resourceGroup')
      .leftJoin('resourceGroup.resources', 'groupResource')
      .select('resource.id', 'resourceId')
      .addSelect('groupResource.id', 'groupResourceId')
      .where('introducer.userId = :userId', { userId })
      .andWhere('(resource.id IN (:...resourceIds) OR groupResource.id IN (:...resourceIds))', {
        resourceIds: [...resourceIds],
      })
      .getRawMany();
  }
  async directIntroducer(userId: number, resourceId: number): Promise<boolean> {
    return !!(await this.manager
      .getRepository(ResourceIntroducer)
      .findOne({ where: { user: { id: userId }, resource: { id: resourceId } } }));
  }
  async groupIntroducer(userId: number, groupIds: readonly number[]): Promise<boolean> {
    return !!(await this.manager
      .getRepository(ResourceIntroducer)
      .findOne({ where: { user: { id: userId }, resourceGroup: { id: In([...groupIds]) } } }));
  }
  async createMaintenance(data: NewMaintenance): Promise<ResourceMaintenance> {
    const repo = this.manager.getRepository(ResourceMaintenance);
    return toApplicationRecord(await repo.save(repo.create(data)));
  }
  async saveMaintenance(data: ResourceMaintenance): Promise<ResourceMaintenance> {
    return toApplicationRecord(await this.manager.getRepository(ResourceMaintenance).save(data));
  }
}

/**
 * SQLite stores `datetime` columns as `YYYY-MM-DD HH:mm:ss.SSS` in UTC (TypeORM's
 * DateUtils.mixedDateToUtcDatetimeString). `new Date(...)` parses that as *local* time, and
 * `.toISOString()` produces a `T`/`Z` form that doesn't compare correctly against stored values.
 * These two helpers are the only places that bridge the formats.
 */
const parseDbDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);

export const formatDbDate = (date: Date): string => date.toISOString().replace('T', ' ').replace('Z', '');

/**
 * Per-(resource, schedule) evaluation data in one query. The `(resourceId, scheduleId, createdAt)`
 * triples are supplied as a CTE, so each schedule is evaluated against its own completed-maintenance
 * baseline without interpolating application values into SQL text.
 */
export const buildScheduleEvaluationQuery = (
  maintenanceTable: string,
  usageTable: string,
  pairCount: number,
): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs}),
               baselines AS (
                 SELECT p.resourceId,
                        p.scheduleId,
                        COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                        EXISTS(
                          SELECT 1
                          FROM "${maintenanceTable}" active
                          WHERE active.resourceId = p.resourceId
                            AND active.startTime <= ?
                            AND active.endTime IS NULL
                        ) AS hasActiveMaintenance
                 FROM pairs p
                 LEFT JOIN "${maintenanceTable}" done
                   ON done.resourceId = p.resourceId
                  AND done.maintenanceScheduleId = p.scheduleId
                  AND done.endTime IS NOT NULL
                 GROUP BY p.resourceId, p.scheduleId, p.createdAt
               )
          SELECT b.resourceId AS resourceId,
                 b.scheduleId AS scheduleId,
                 b.baseline AS baseline,
                 b.hasActiveMaintenance AS hasActiveMaintenance,
                 COUNT(u.id) AS totalCount
          FROM baselines b
          LEFT JOIN "${usageTable}" u
            ON u.resourceId = b.resourceId
           AND u.lifecyclePending = 0
           AND u.endTime IS NOT NULL
           AND u.endTime >= b.baseline
          GROUP BY b.resourceId, b.scheduleId, b.baseline, b.hasActiveMaintenance`;
};

export const MAX_PAIRS_PER_QUERY = 10_921;

/** Fetch completed-maintenance baselines and active state without scanning resource usage. */
export const buildScheduleStateQuery = (maintenanceTable: string, pairCount: number): string => {
  const pairs = Array.from({ length: pairCount }, () => '(?, ?, ?)').join(', ');

  return `WITH pairs(resourceId, scheduleId, createdAt) AS (VALUES ${pairs})
          SELECT p.resourceId AS resourceId,
                 p.scheduleId AS scheduleId,
                 COALESCE(MAX(done.endTime), p.createdAt) AS baseline,
                 EXISTS(
                   SELECT 1
                   FROM "${maintenanceTable}" active
                   WHERE active.resourceId = p.resourceId
                     AND active.startTime <= ?
                     AND active.endTime IS NULL
                 ) AS hasActiveMaintenance
          FROM pairs p
          LEFT JOIN "${maintenanceTable}" done
            ON done.resourceId = p.resourceId
           AND done.maintenanceScheduleId = p.scheduleId
           AND done.endTime IS NOT NULL
          GROUP BY p.resourceId, p.scheduleId, p.createdAt`;
};

/** SQL batching, date encoding and candidate savepoints belong to the backend. */
export class TypeormMaintenanceEvaluationPersistence extends MaintenanceEvaluationPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async hasEnabledSchedules(resourceId: number): Promise<boolean> {
    return this.manager.getRepository(ResourceMaintenanceSchedule).existsBy({ resourceId, enabled: true });
  }
  async enabledSchedules(resourceId?: number): Promise<ResourceMaintenanceSchedule[]> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceMaintenanceSchedule).find({
        where: { enabled: true, ...(resourceId === undefined ? {} : { resourceId }) },
        relations: ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'],
      }),
    );
  }
  async resourceCreationDate(id: number): Promise<Date | null> {
    const resource = await this.manager.getRepository(Resource).findOne({ where: { id }, select: ['id', 'createdAt'] });
    return resource?.createdAt ?? null;
  }
  async resourceCreationDates(ids: readonly number[]): Promise<{ id: number; createdAt: Date }[]> {
    if (!ids.length) return [];
    return toApplicationRecord(
      await this.manager.getRepository(Resource).find({ where: { id: In([...ids]) }, select: ['id', 'createdAt'] }),
    );
  }
  async lastCompleted(resourceId: number, scheduleId: number): Promise<Date | null> {
    const row = await this.manager
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('m')
      .where('m.resourceId = :resourceId', { resourceId })
      .andWhere('m.maintenanceScheduleId = :scheduleId', { scheduleId })
      .andWhere('m.endTime IS NOT NULL')
      .orderBy('m.endTime', 'DESC')
      .limit(1)
      .getOne();
    return row?.endTime ?? null;
  }
  usageCount(resourceId: number, since: Date): Promise<number> {
    return this.manager
      .getRepository(ResourceUsage)
      .createQueryBuilder('usage')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.lifecyclePending = :lifecyclePending', { lifecyclePending: false })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getCount();
  }
  async scheduleState(
    pairs: readonly ScheduleEvaluationPair[],
    now: Date,
    includeUsageCount: boolean,
  ): Promise<ScheduleEvaluationRow[]> {
    const maintenance = this.manager.getRepository(ResourceMaintenance).metadata.tableName;
    const usage = this.manager.getRepository(ResourceUsage);
    const result: ScheduleEvaluationRow[] = [];
    for (let offset = 0; offset < pairs.length; offset += MAX_PAIRS_PER_QUERY) {
      const chunk = pairs.slice(offset, offset + MAX_PAIRS_PER_QUERY);
      const sql = includeUsageCount
        ? buildScheduleEvaluationQuery(maintenance, usage.metadata.tableName, chunk.length)
        : buildScheduleStateQuery(maintenance, chunk.length);
      const rows = await usage.query(sql, [
        ...chunk.flatMap((pair) => [pair.resourceId, pair.scheduleId, formatDbDate(pair.createdAt)]),
        formatDbDate(now),
      ]);
      for (const row of rows)
        result.push({
          resourceId: row.resourceId,
          scheduleId: row.scheduleId,
          baseline: row.baseline ? parseDbDate(row.baseline) : null,
          hasActiveMaintenance: !!row.hasActiveMaintenance,
          ...(includeUsageCount ? { totalCount: Number(row.totalCount ?? 0) } : {}),
        });
    }
    return result;
  }
  async attemptCreation(resourceId: number, create: () => Promise<number | undefined>): Promise<number | undefined> {
    if (!Number.isSafeInteger(resourceId) || resourceId < 1)
      throw new MaintenanceBatchIsolationError('Invalid maintenance resource');
    const name = `maintenance_schedule_${resourceId}`;
    try {
      await this.manager.query(`SAVEPOINT ${name}`);
    } catch {
      throw new MaintenanceBatchIsolationError('Cannot isolate maintenance candidate');
    }
    let id: number | undefined;
    try {
      id = await create();
    } catch (error) {
      try {
        await this.manager.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await this.manager.query(`RELEASE SAVEPOINT ${name}`);
      } catch {
        throw new MaintenanceBatchIsolationError('Cannot discard maintenance candidate');
      }
      throw error;
    }
    try {
      await this.manager.query(`RELEASE SAVEPOINT ${name}`);
    } catch {
      throw new MaintenanceBatchIsolationError('Cannot complete maintenance candidate');
    }
    return id;
  }
}
