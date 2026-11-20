import {
  Resource,
  ResourceFlowNode,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { OperatingIntervalRecord, OperatingTimelineSession } from '@attraccess/application-models';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, FindOptionsWhere, In, IsNull, LessThan, MoreThan, Not } from 'typeorm';
import { unitOfWorkFor } from '../shared-unit-of-work';
import {
  OperatingClockRegressionError,
  OperatingState,
  OperatingTimelinePage,
  OperatingTimelineStore,
  OperatingTransitionProvenance,
  TimelineWindow,
} from '../../../resources/operating-intervals/operating-timeline.port';
import { isUniqueViolation } from '../../persistence-errors';
import type { TransactionContext } from '../../transaction-context';
import { UNIT_OF_WORK, UnitOfWork } from '../../unit-of-work';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { findSelect } from '../find-options';

const SESSION_COLUMNS: (keyof ResourceUsage)[] = [
  'id',
  'resourceId',
  'usageAction',
  'lifecyclePending',
  'startTime',
  'endTime',
  'operatingDurationCreditsPerMinute',
];

export function toIntervalRecord(row: ResourceOperatingInterval): OperatingIntervalRecord {
  return {
    id: row.id,
    resourceId: row.resourceId,
    startTime: row.startTime,
    endTime: row.endTime,
    startFlowNodeId: row.startFlowNodeId ?? null,
    startFlowRunId: row.startFlowRunId ?? null,
    endFlowNodeId: row.endFlowNodeId ?? null,
    endFlowRunId: row.endFlowRunId ?? null,
  };
}

function toSessionRecord(row: ResourceUsage): OperatingTimelineSession {
  return {
    id: row.id,
    resourceId: row.resourceId,
    usageAction: row.usageAction,
    lifecyclePending: row.lifecyclePending,
    startTime: row.startTime,
    endTime: row.endTime,
    operatingDurationCreditsPerMinute: row.operatingDurationCreditsPerMinute ?? null,
  };
}

/** Rows overlapping `[from, to)`: still open, or ending after `from`. Windows with the same start share a query. */
function overlapping(
  windows: TimelineWindow[],
  to: Date,
): FindOptionsWhere<{ resourceId: number; startTime: Date; endTime: Date | null }>[] {
  const byStart = new Map<number, number[]>();
  for (const { resourceId, from } of windows) {
    byStart.set(from.getTime(), [...(byStart.get(from.getTime()) ?? []), resourceId]);
  }
  return [...byStart].flatMap(([from, resourceIds]) => {
    const resourceId = resourceIds.length === 1 ? resourceIds[0] : In([...new Set(resourceIds)]);
    return [
      { resourceId, startTime: LessThan(to), endTime: IsNull() },
      { resourceId, startTime: LessThan(to), endTime: MoreThan(new Date(from)) },
    ];
  });
}

/** The adapter wired by hand for one DataSource, for tests that compose services without a Nest module. */
export function createOperatingTimelineStore(source: DataSource): OperatingTimelineStore {
  const unitOfWork = unitOfWorkFor(source);
  return new TypeOrmOperatingTimelineStore(unitOfWork, new EntityManagerResolver(unitOfWork, source));
}

/** TypeORM implementation of the operating timeline port. Interval rows are never deleted here (ATT-1024). */
@Injectable()
export class TypeOrmOperatingTimelineStore implements OperatingTimelineStore {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly managers: EntityManagerResolver,
  ) {}

  async recordTransition(
    resourceId: number,
    state: OperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<OperatingIntervalRecord | null> {
    try {
      const saved = await this.unitOfWork.run((scope) =>
        this.persistTransition(this.managers.resolve(scope), resourceId, state, provenance),
      );
      return saved ? toIntervalRecord(saved) : null;
    } catch (error) {
      // A duplicate operating transition lost the race on the one-open-interval unique index.
      if (state === 'operating' && isUniqueViolation(error)) return null;
      throw error;
    }
  }

  private async persistTransition(
    manager: EntityManager,
    resourceId: number,
    state: OperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    // Updating the parent row acquires a database-backed per-resource write lock.
    await manager.query('UPDATE "resource" SET "id" = "id" WHERE "id" = ?', [resourceId]);

    const repository = manager.getRepository(ResourceOperatingInterval);
    const latestInterval = await repository.findOne({
      where: { resourceId },
      order: { startTime: 'DESC', id: 'DESC' },
    });
    // Read the clock after obtaining the write lock so queued assignments use their application time.
    const transitionTime = new Date();
    const lastTransitionTime = latestInterval?.endTime ?? latestInterval?.startTime;
    if (lastTransitionTime && transitionTime < lastTransitionTime) throw new OperatingClockRegressionError();
    const openInterval = latestInterval?.endTime === null ? latestInterval : null;

    if (state === 'idle') {
      if (!openInterval) return null;
      openInterval.endTime = transitionTime;
      openInterval.endFlowNodeId = provenance?.flowNodeId ?? null;
      openInterval.endFlowRunId = provenance?.flowRunId ?? null;
      return repository.save(openInterval);
    }
    if (openInterval) return null;

    // The transition timestamp is deliberately taken inside the server-side transaction.
    return repository.save(
      repository.create({
        resourceId,
        startTime: transitionTime,
        endTime: null,
        startFlowNodeId: provenance?.flowNodeId ?? null,
        startFlowRunId: provenance?.flowRunId ?? null,
        endFlowNodeId: null,
        endFlowRunId: null,
      }),
    );
  }

  async findIntervals(
    windows: TimelineWindow[],
    to: Date,
    context?: TransactionContext,
  ): Promise<OperatingIntervalRecord[]> {
    if (windows.length === 0) return [];
    const rows = await this.managers
      .resolve(context)
      .getRepository(ResourceOperatingInterval)
      .find({
        where: overlapping(windows, to),
        order: { startTime: 'ASC' },
      });
    return rows.map(toIntervalRecord);
  }

  async findSessions(
    windows: TimelineWindow[],
    to: Date,
    options: { excludeUsageId?: number } = {},
    context?: TransactionContext,
  ): Promise<OperatingTimelineSession[]> {
    if (windows.length === 0) return [];
    const repository = this.managers.resolve(context).getRepository(ResourceUsage);
    const rows = await repository.find({
      where: overlapping(windows, to).map((condition) => ({
        ...condition,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
        ...(options.excludeUsageId === undefined ? {} : { id: Not(options.excludeUsageId) }),
      })),
      select: findSelect(SESSION_COLUMNS.filter((column) => repository.metadata.findColumnWithPropertyName(column))),
      order: { startTime: 'ASC' },
    });
    return rows.map(toSessionRecord);
  }

  async findResourcesWithIntervals(resourceIds: number[]): Promise<Set<number>> {
    if (resourceIds.length === 0) return new Set();
    const rows = await this.managers
      .resolve()
      .getRepository(ResourceOperatingInterval)
      .createQueryBuilder('interval')
      .select('DISTINCT interval.resourceId', 'resourceId')
      .where('interval.resourceId IN (:...resourceIds)', { resourceIds })
      .getRawMany<{ resourceId: number }>();
    return new Set(rows.map(({ resourceId }) => resourceId));
  }

  async findPendingSessionEnds(resourceIds: number[], context?: TransactionContext): Promise<Map<number, Date>> {
    const attempts = await this.managers
      .resolve(context)
      .getRepository(ResourceUsageLifecycleAttempt)
      .find({
        where: { resourceId: In(resourceIds), kind: In(['end', 'takeover']) },
        select: { previousUsageId: true, transitionTime: true },
      });
    return new Map(
      attempts.flatMap((attempt) =>
        attempt.previousUsageId === null ? [] : [[attempt.previousUsageId, attempt.transitionTime] as const],
      ),
    );
  }

  async findCurrentState(resourceId: number) {
    const repository = this.managers.resolve().getRepository(ResourceOperatingInterval);
    const [open, latest] = await Promise.all([
      repository.findOne({ where: { resourceId, endTime: IsNull() } }),
      repository.findOne({ where: { resourceId }, order: { startTime: 'DESC' } }),
    ]);
    return { open: open && toIntervalRecord(open), latest: latest && toIntervalRecord(latest) };
  }

  async pageIntervals(resourceId: number, page: number, limit: number): Promise<OperatingTimelinePage> {
    const [rows, total] = await this.managers
      .resolve()
      .getRepository(ResourceOperatingInterval)
      .findAndCount({
        where: { resourceId },
        order: { startTime: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });
    return { intervals: rows.map(toIntervalRecord), total };
  }

  async findIntervalsActiveSince(resourceId: number, since: Date): Promise<OperatingIntervalRecord[]> {
    const rows = await this.managers
      .resolve()
      .getRepository(ResourceOperatingInterval)
      .find({
        where: [
          { resourceId, startTime: MoreThan(since) },
          { resourceId, endTime: MoreThan(since) },
        ],
        order: { startTime: 'ASC' },
      });
    return rows.map(toIntervalRecord);
  }

  countOpenIntervals(resourceId: number): Promise<number> {
    return this.managers
      .resolve()
      .getRepository(ResourceOperatingInterval)
      .count({ where: { resourceId, endTime: IsNull() } });
  }

  async countTrackingNodes(resourceId: number, nodeTypes: readonly string[]): Promise<number> {
    const manager = this.managers.resolve();
    const types = In([...nodeTypes]) as FindOptionsWhere<ResourceFlowNode>['type'];
    const own: FindOptionsWhere<ResourceFlowNode> = { resourceId, type: types };
    const resource = await manager.findOne(Resource, {
      where: { id: resourceId },
      select: { id: true, type: true },
    });
    const nodes = manager.getRepository(ResourceFlowNode);
    if (resource?.type !== ResourceType.Machine) return nodes.count({ where: own });
    return nodes.count({ where: [own, { type: types, flow: { enabled: true, scope: 'global' } }] });
  }
}
