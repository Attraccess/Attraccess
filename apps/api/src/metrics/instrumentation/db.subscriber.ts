// TypeORM EntitySubscriber recording per-entity query durations and slow query counts
// FEATURE: Metrics — database query timing instrumentation
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DB_METRICS } from '../definitions/tokens';
import { DbMetrics } from '../definitions/db.metrics';
import { MetricsToggleService } from '../settings/metrics-toggle.service';

type DbMethod = 'insert' | 'update' | 'remove' | 'softRemove';

const SLOW_QUERY_THRESHOLD_SECONDS = 0.5;

@Injectable()
@EventSubscriber()
export class DbMetricsSubscriber implements EntitySubscriberInterface, OnModuleInit {
  private readonly starts = new WeakMap<object, bigint>();

  constructor(
    @Inject(DB_METRICS) private readonly metrics: DbMetrics,
    private readonly toggle: MetricsToggleService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    if (!this.dataSource.subscribers.includes(this)) {
      this.dataSource.subscribers.push(this);
    }
  }

  beforeInsert(event: InsertEvent<unknown>): void {
    this.start(event);
  }

  afterInsert(event: InsertEvent<unknown>): void {
    this.observe(event, 'insert');
  }

  beforeUpdate(event: UpdateEvent<unknown>): void {
    this.start(event);
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    this.observe(event, 'update');
  }

  beforeRemove(event: RemoveEvent<unknown>): void {
    this.start(event);
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    this.observe(event, 'remove');
  }

  beforeSoftRemove(event: SoftRemoveEvent<unknown>): void {
    this.start(event);
  }

  afterSoftRemove(event: SoftRemoveEvent<unknown>): void {
    this.observe(event, 'softRemove');
  }

  private start(event: { metadata?: { tableName?: string } }): void {
    if (!this.toggle.isEnabledCached('db')) return;
    this.starts.set(event as object, process.hrtime.bigint());
  }

  private observe(event: { metadata?: { tableName?: string } }, method: DbMethod): void {
    if (!this.toggle.isEnabledCached('db')) {
      this.starts.delete(event as object);
      return;
    }
    const startTime = this.starts.get(event as object);
    if (startTime === undefined) return;
    this.starts.delete(event as object);
    const seconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const entity = event.metadata?.tableName ?? 'unknown';
    this.metrics.queryDuration.observe({ entity, method }, seconds);
    if (seconds > SLOW_QUERY_THRESHOLD_SECONDS) {
      this.metrics.slowQueriesTotal.inc({ entity, method });
    }
  }
}
