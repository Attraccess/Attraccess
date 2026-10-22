import { OperatingAttributionPersistence, OperatingDurationRow, UsageDurationRow } from './port';
import { NewOperatingInterval, OpenOperatingIntervalConflictError, OperatingIntervalOperations } from './port';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, LessThan, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { OperatingDiagnosticsPersistence } from './port';

@Injectable()
export class TypeormOperatingDiagnosticsPersistence extends OperatingDiagnosticsPersistence {
  constructor(
    @InjectRepository(ResourceOperatingInterval) private readonly intervals: Repository<ResourceOperatingInterval>,
    @InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>,
  ) {
    super();
  }
  async openInterval(resourceId: number): Promise<ResourceOperatingInterval | null> {
    return toApplicationRecord(await this.intervals.findOne({ where: { resourceId, endTime: IsNull() } }));
  }
  async latestInterval(resourceId: number): Promise<ResourceOperatingInterval | null> {
    return toApplicationRecord(await this.intervals.findOne({ where: { resourceId }, order: { startTime: 'DESC' } }));
  }
  async intervalPage(resourceId: number, page: number, limit: number): Promise<[ResourceOperatingInterval[], number]> {
    return toApplicationRecord(
      await this.intervals.findAndCount({
        where: { resourceId },
        order: { startTime: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    );
  }
  trackingNodeCount(resourceId: number, types: readonly ResourceFlowNodeType[]): Promise<number> {
    return this.nodes.count({ where: { resourceId, type: In([...types]) } });
  }
  async recentTransitions(resourceId: number, from: Date): Promise<ResourceOperatingInterval[]> {
    return toApplicationRecord(
      await this.intervals.find({
        where: [
          { resourceId, startTime: MoreThan(from) },
          { resourceId, endTime: MoreThan(from) },
        ],
        order: { startTime: 'ASC' },
      }),
    );
  }
  openIntervalCount(resourceId: number): Promise<number> {
    return this.intervals.count({ where: { resourceId, endTime: IsNull() } });
  }
  async overlappingWindow(resourceId: number, from: Date, to: Date): Promise<ResourceOperatingInterval[]> {
    return toApplicationRecord(
      await this.intervals.find({
        where: [
          { resourceId, startTime: LessThan(to), endTime: IsNull() },
          { resourceId, startTime: LessThan(to), endTime: MoreThan(from) },
        ],
        order: { startTime: 'ASC' },
      }),
    );
  }
}

export class TypeormOperatingIntervalOperations implements OperatingIntervalOperations {
  constructor(private readonly manager: EntityManager) {}
  async lockResource(resourceId: number): Promise<void> {
    await this.manager.query('UPDATE "resource" SET "id" = "id" WHERE "id" = ?', [resourceId]);
  }
  async latestInterval(resourceId: number): Promise<ResourceOperatingInterval | null> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceOperatingInterval).findOne({
        where: { resourceId },
        order: { startTime: 'DESC', id: 'DESC' },
      }),
    );
  }
  async saveInterval(interval: ResourceOperatingInterval): Promise<ResourceOperatingInterval> {
    return this.persist(() => this.manager.getRepository(ResourceOperatingInterval).save(interval));
  }
  async createInterval(interval: NewOperatingInterval): Promise<ResourceOperatingInterval> {
    const rows = this.manager.getRepository(ResourceOperatingInterval);
    return this.persist(() => rows.save(rows.create(interval)));
  }
  private async persist(work: () => Promise<ResourceOperatingInterval>): Promise<ResourceOperatingInterval> {
    try {
      return toApplicationRecord(await work());
    } catch (error) {
      const code = (error as QueryFailedError & { code?: string | number }).code;
      if (
        error instanceof QueryFailedError &&
        (code === '23505' || (code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed')))
      ) {
        throw new OpenOperatingIntervalConflictError(error.message);
      }
      throw error;
    }
  }
}
export function operatingIntervalTransactionOperations(manager: EntityManager): OperatingIntervalOperations {
  return new TypeormOperatingIntervalOperations(manager);
}

export class TypeormOperatingAttributionPersistence extends OperatingAttributionPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async intervals(resourceIds: readonly number[], asOf: Date, windowStart: Date): Promise<ResourceOperatingInterval[]> {
    if (!resourceIds.length) return [];
    const resourceId = resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]);
    return toApplicationRecord(
      await this.manager.getRepository(ResourceOperatingInterval).find({
        where: [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
    );
  }
  async usages(resourceIds: readonly number[], asOf: Date, windowStart: Date): Promise<ResourceUsage[]> {
    if (!resourceIds.length) return [];
    const resourceId = resourceIds.length === 1 ? resourceIds[0] : In([...resourceIds]);
    const common = {
      resourceId,
      usageAction: ResourceUsageAction.Usage,
      lifecyclePending: false,
      startTime: LessThan(asOf),
    };
    return toApplicationRecord(
      await this.manager.getRepository(ResourceUsage).find({
        where: [
          { ...common, endTime: IsNull() },
          { ...common, endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
    );
  }
  hasData(resourceId: number): Promise<boolean> {
    return this.manager.getRepository(ResourceOperatingInterval).existsBy({ resourceId });
  }
  async resourcesWithData(resourceIds: readonly number[]): Promise<number[]> {
    if (!resourceIds.length) return [];
    const rows = await this.manager
      .getRepository(ResourceOperatingInterval)
      .createQueryBuilder('interval')
      .select('DISTINCT interval.resourceId', 'resourceId')
      .where('interval.resourceId IN (:...resourceIds)', { resourceIds: [...resourceIds] })
      .getRawMany<{ resourceId: number }>();
    return rows.map((row) => row.resourceId);
  }
  async pendingEnds(
    resourceIds: readonly number[],
  ): Promise<Pick<ResourceUsageLifecycleAttempt, 'previousUsageId' | 'transitionTime'>[]> {
    if (!resourceIds.length) return [];
    return toApplicationRecord(
      await this.manager
        .getRepository(ResourceUsageLifecycleAttempt)
        .find({
          where: { resourceId: In([...resourceIds]), kind: In(['end', 'takeover']) },
          select: ['previousUsageId', 'transitionTime'],
        }),
    );
  }
  async durationRows(
    boundaries: readonly { resourceId: number; start: Date }[],
    asOf: Date,
  ): Promise<{ intervals: OperatingDurationRow[]; usages: UsageDurationRow[] }> {
    if (!boundaries.length) return { intervals: [], usages: [] };
    const where = boundaries.flatMap(({ resourceId, start }) => [
      { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
      { resourceId, startTime: LessThan(asOf), endTime: MoreThan(start) },
    ]);
    const [intervals, usages] = await Promise.all([
      this.manager
        .getRepository(ResourceOperatingInterval)
        .find({ where, select: ['resourceId', 'startTime', 'endTime'] }),
      this.manager
        .getRepository(ResourceUsage)
        .find({
          where: where.map((condition) => ({
            ...condition,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
          })),
          select: ['id', 'resourceId', 'startTime', 'endTime'],
        }),
    ]);
    return toApplicationRecord({ intervals, usages });
  }
}
