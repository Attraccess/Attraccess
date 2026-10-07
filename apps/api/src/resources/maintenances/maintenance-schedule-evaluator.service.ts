import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceUsage,
} from '@attraccess/database-entities';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronTimer } from '../../metrics/instrumentation/cron/cron.helper';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { MaintenanceTriggeredScheduleWritingImplementation } from './maintenance-triggered-schedule-writing';
import { ResourceMaintenanceService } from './maintenance.service';

/**
 * Evaluates maintenance schedules and creates ResourceMaintenance when a schedule's condition is met.
 * Baseline for all trigger types: when the last maintenance created by this schedule was marked done
 * (that maintenance's endTime/completedAt). If none, uses resource.createdAt.
 *
 * Runs via cron (periodic) and on usage events (session started or ended) so USAGE_HOURS and USAGE_COUNT triggers take effect immediately.
 */
@Injectable()
export class MaintenanceScheduleEvaluatorService
  extends MaintenanceTriggeredScheduleWritingImplementation
  implements OnModuleDestroy
{
  protected readonly logger = new Logger(MaintenanceScheduleEvaluatorService.name);
  protected evaluationLock = false;

  /** Debounce window in ms: evaluation is delayed until no new events arrive within this window. */
  protected readonly usageEvalDebounceMs = 5_000;
  /** Maximum wait in ms: evaluation fires even if events keep arriving, preventing indefinite starvation. */
  protected readonly usageEvalMaxWaitMs = 30_000;
  protected readonly pendingUsageEvals = new Map<number, ReturnType<typeof setTimeout>>();
  /** Timestamp (Date.now()) of the first unprocessed usage event per resource, for maxWait tracking. */
  protected readonly usageEvalFirstEventAt = new Map<number, number>();

  constructor(
    @InjectRepository(ResourceMaintenanceSchedule)
    protected readonly scheduleRepository: Repository<ResourceMaintenanceSchedule>,
    @InjectRepository(ResourceMaintenance)
    protected readonly maintenanceRepository: Repository<ResourceMaintenance>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    protected readonly usageRepository: Repository<ResourceUsage>,
    protected readonly maintenanceService: ResourceMaintenanceService,
    protected readonly cronTimer: CronTimer,
    protected readonly metricsService: MetricsService,
    protected readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {
    super();
  }
}

export {
  buildScheduleEvaluationQuery,
  buildScheduleStateQuery,
  formatDbDate,
} from './maintenance-schedule-evaluator.service.feature-definitions';
