import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceUsage,
} from '@attraccess/database-entities';
import type { MaintenanceScheduleRecord } from '@attraccess/application-models';
import type {
  MaintenanceEvaluationStore,
  MaintenanceEvaluationView,
  ServiceCycleRequest,
  ServiceCycleState,
} from '../../../resources/maintenances/maintenance-evaluation-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK, type UnitOfWork } from '../../unit-of-work';
import {
  MAX_PAIRS_PER_QUERY,
  buildScheduleEvaluationQuery,
  buildScheduleStateQuery,
  formatDbDate,
  parseDbDate,
} from './maintenance-evaluation-queries';
import { MaintenanceSnapshotReader, captureDurationState } from './maintenance-snapshot-reader';
import { toMaintenanceScheduleRecord } from './maintenance-mappers';

const CONFIG_RELATIONS = ['usageHoursConfig', 'usageCountConfig', 'timeIntervalConfig'];

interface CycleRow {
  resourceId: number;
  scheduleId: number;
  baseline?: string | Date;
  hasActiveMaintenance?: number | boolean;
  totalCount?: number | string | null;
}

/** The reads and writes of one evaluation, on the entity manager of a snapshot, a transaction or the connection. */
export class TypeOrmMaintenanceEvaluationView implements MaintenanceEvaluationView {
  private savepoints = 0;

  constructor(
    private readonly manager: EntityManager,
    readonly context: object | undefined,
  ) {}

  async enabledSchedules(resourceId: number): Promise<MaintenanceScheduleRecord[]> {
    const schedules = await this.manager.getRepository(ResourceMaintenanceSchedule).find({
      where: { resourceId, enabled: true },
      relations: CONFIG_RELATIONS,
    });
    return schedules.map(toMaintenanceScheduleRecord);
  }

  async baselineDate(resourceId: number, scheduleId: number): Promise<Date> {
    const lastDone = await this.manager
      .getRepository(ResourceMaintenance)
      .createQueryBuilder('m')
      .where('m.resourceId = :resourceId', { resourceId })
      .andWhere('m.maintenanceScheduleId = :scheduleId', { scheduleId })
      .andWhere('m.endTime IS NOT NULL')
      .orderBy('m.endTime', 'DESC')
      .limit(1)
      .getOne();

    if (lastDone?.endTime) return lastDone.endTime;

    const resource = await this.manager.getRepository(Resource).findOne({
      where: { id: resourceId },
      select: ['id', 'createdAt'],
    });
    return resource?.createdAt ?? new Date(0);
  }

  async completedSessionCountSince(resourceId: number, since: Date): Promise<number> {
    return this.manager
      .getRepository(ResourceUsage)
      .createQueryBuilder('usage')
      .where('usage.resourceId = :resourceId', { resourceId })
      .andWhere('usage.lifecyclePending = :lifecyclePending', { lifecyclePending: false })
      .andWhere('usage.endTime IS NOT NULL')
      .andWhere('usage.endTime >= :since', { since })
      .getCount();
  }

  durationFingerprint(resourceId: number): Promise<string> {
    return captureDurationState(resourceId, this.manager);
  }

  async atomically<T>(name: string, work: () => Promise<T>): Promise<T> {
    const savepoint = `${name}_${this.savepoints++}`.replace(/\W/g, '_');
    await this.manager.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await work();
      await this.manager.query(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await this.manager.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await this.manager.query(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    }
  }
}

/**
 * TypeORM implementation of the maintenance evaluation port. On SQLite, history is read through an independent
 * read-only connection (see MaintenanceSnapshotReader) so evaluation never borrows the connection of in-flight
 * session writes; the evaluator validates the result inside a short write transaction.
 */
@Injectable()
export class TypeOrmMaintenanceEvaluationStore implements MaintenanceEvaluationStore {
  private snapshotReader?: MaintenanceSnapshotReader;
  private readonly unitOfWork: ScopedUnitOfWork<EntityManager>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(UNIT_OF_WORK) unitOfWork: UnitOfWork,
  ) {
    this.unitOfWork = unitOfWork as ScopedUnitOfWork<EntityManager>;
  }

  get snapshotReads(): boolean {
    return this.dataSource.options.type === 'sqlite';
  }

  current(): MaintenanceEvaluationView {
    return new TypeOrmMaintenanceEvaluationView(this.dataSource.manager, undefined);
  }

  hasEnabledSchedules(resourceId: number): Promise<boolean> {
    return this.dataSource.getRepository(ResourceMaintenanceSchedule).existsBy({ resourceId, enabled: true });
  }

  async listEnabledSchedules(): Promise<MaintenanceScheduleRecord[]> {
    const schedules = await this.dataSource.getRepository(ResourceMaintenanceSchedule).find({
      where: { enabled: true },
      relations: CONFIG_RELATIONS,
    });
    return schedules.map(toMaintenanceScheduleRecord);
  }

  async findResourceCreatedAt(resourceIds: number[]): Promise<Map<number, Date>> {
    const resources = await this.dataSource.getRepository(Resource).find({
      where: { id: In(resourceIds) },
      select: ['id', 'createdAt'],
    });
    return new Map(resources.map((resource) => [resource.id, resource.createdAt]));
  }

  async loadServiceCycleStates(requests: ServiceCycleRequest[], now: Date): Promise<ServiceCycleState[]> {
    const maintenanceTable = this.dataSource.getMetadata(ResourceMaintenance).tableName;
    const usageTable = this.dataSource.getMetadata(ResourceUsage).tableName;
    const states: ServiceCycleState[] = [];
    const toState = (row: CycleRow, createdAt: Date | undefined): ServiceCycleState => ({
      resourceId: row.resourceId,
      scheduleId: row.scheduleId,
      baseline: row.baseline ? parseDbDate(row.baseline) : (createdAt ?? now),
      hasActiveMaintenance: Boolean(row.hasActiveMaintenance),
      completedSessions: Number(row.totalCount ?? 0),
    });
    const createdAtOf = new Map(requests.map((r) => [`${r.scheduleId}:${r.resourceId}`, r.createdAt]));
    const params = (chunk: ServiceCycleRequest[]) => [
      ...chunk.flatMap((pair) => [pair.resourceId, pair.scheduleId, formatDbDate(pair.createdAt)]),
      formatDbDate(now),
    ];

    // Completed-maintenance baselines and active state, without scanning resource usage.
    const withoutCount = requests.filter(({ countSessions }) => !countSessions);
    for (let offset = 0; offset < withoutCount.length; offset += MAX_PAIRS_PER_QUERY) {
      const chunk = withoutCount.slice(offset, offset + MAX_PAIRS_PER_QUERY);
      const rows: CycleRow[] = await this.dataSource.manager.query(
        buildScheduleStateQuery(maintenanceTable, chunk.length),
        params(chunk),
      );
      for (const row of rows) states.push(toState(row, createdAtOf.get(`${row.scheduleId}:${row.resourceId}`)));
    }

    // Completed-session counts in the single-statement baseline/count query.
    const withCount = requests.filter(({ countSessions }) => countSessions);
    for (let offset = 0; offset < withCount.length; offset += MAX_PAIRS_PER_QUERY) {
      const chunk = withCount.slice(offset, offset + MAX_PAIRS_PER_QUERY);
      const rows: CycleRow[] = await this.dataSource.manager.query(
        buildScheduleEvaluationQuery(maintenanceTable, usageTable, chunk.length),
        params(chunk),
      );
      for (const row of rows) states.push(toState(row, createdAtOf.get(`${row.scheduleId}:${row.resourceId}`)));
    }
    return states;
  }

  async inSnapshot<T>(work: (view: MaintenanceEvaluationView) => Promise<T>): Promise<T> {
    this.snapshotReader ??= new MaintenanceSnapshotReader(this.dataSource);
    const reader = await this.snapshotReader.manager();
    return work(new TypeOrmMaintenanceEvaluationView(reader, reader));
  }

  inTransaction<T>(work: (view: MaintenanceEvaluationView) => Promise<T>): Promise<T> {
    return this.unitOfWork.run((scope) =>
      work(new TypeOrmMaintenanceEvaluationView(this.unitOfWork.handleOf(scope), scope)),
    );
  }

  async close(): Promise<void> {
    await this.snapshotReader?.close();
  }
}
