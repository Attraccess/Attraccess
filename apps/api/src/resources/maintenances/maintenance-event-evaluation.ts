import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ResourceOperatingStateChangedEvent } from '../operating-intervals/events/resource-operating-state-changed.event';
import { ResourceSessionStartedEvent, ResourceUsageLifecycleAbortedEvent } from '../usage/events/resource-usage.events';
import { ResourceMaintenanceChangedEvent } from './events/resource-maintenance-changed.event';
import { MaintenanceResourceEvaluationImplementation } from './maintenance-resource-evaluation';
export abstract class MaintenanceEventEvaluationImplementation extends MaintenanceResourceEvaluationImplementation {
  /** Drop pending debounce timers so shutdown isn't held up (and they don't fire against a closed DB). */
  onModuleDestroy(): void {
    for (const timer of this.pendingUsageEvals.values()) clearTimeout(timer);
    this.pendingUsageEvals.clear();
    this.usageEvalFirstEventAt.clear();
  }

  /**
   * Cron: run schedule evaluation every 5 minutes. Only one active maintenance per resource; idempotent when already in maintenance.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runScheduledEvaluation(): Promise<void> {
    await this.cronTimer.time('maintenance_evaluator', async () => {
      await this.evaluateAll();
    });
  }

  /**
   * On usage events (session started or ended): evaluate schedules for that resource so USAGE_HOURS and USAGE_COUNT
   * triggers take effect immediately instead of waiting for the next cron run.
   *
   * Debounced per resource with a maximum wait: rapid session end/start bursts collapse into a single
   * evaluation, but evaluation is guaranteed to fire within usageEvalMaxWaitMs regardless of how
   * frequently events arrive (preventing indefinite starvation under sustained load).
   *
   * Listens to ResourceSessionStartedEvent rather than ResourceUsageSessionEndedEvent: despite the
   * name, ResourceUsageService.emitUsageEvent() fires it on every session start *and* end (with the
   * usage re-read after commit, so endTime is set). ResourceUsageSessionEndedEvent only fires on
   * takeover/flow-ended sessions, which would miss the common case of a user ending their own session.
   */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  onResourceUsage(event: ResourceSessionStartedEvent): void {
    const resourceId = event.usage?.resource?.id;
    if (resourceId == null) return;
    this.queueEvaluation(resourceId);
  }

  @OnEvent(ResourceOperatingStateChangedEvent.EVENT_NAME)
  onOperatingStateChanged(event: ResourceOperatingStateChangedEvent): void {
    this.queueEvaluation(event.resourceId);
  }

  @OnEvent(ResourceUsageLifecycleAbortedEvent.EVENT_NAME)
  onUsageLifecycleAborted(event: ResourceUsageLifecycleAbortedEvent): void {
    this.queueEvaluation(event.resourceId);
  }

  protected queueEvaluation(resourceId: number): void {
    const now = Date.now();

    // Record the timestamp of the first event in the current debounce window
    if (!this.usageEvalFirstEventAt.has(resourceId)) {
      this.usageEvalFirstEventAt.set(resourceId, now);
    }

    const firstEventAt = this.usageEvalFirstEventAt.get(resourceId) ?? now;
    const msUntilMaxWait = this.usageEvalMaxWaitMs - (now - firstEventAt);
    // Fire after the debounce window, but no later than the maxWait deadline
    const delay = Math.min(this.usageEvalDebounceMs, Math.max(0, msUntilMaxWait));

    const existing = this.pendingUsageEvals.get(resourceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pendingUsageEvals.delete(resourceId);
      this.usageEvalFirstEventAt.delete(resourceId);
      this.evaluateResource(resourceId).catch((err) => {
        this.logger.error(
          `Error evaluating schedules for resource ${resourceId} after duration event: ${err}`,
          (err as Error)?.stack,
        );
      });
    }, delay);

    this.pendingUsageEvals.set(resourceId, timer);
  }

  /**
   * On maintenance changed (created or marked done): re-evaluate schedules for that resource.
   * When maintenance is marked done, this allows the next schedule to trigger immediately
   * instead of waiting for the next cron run (up to 5 minutes).
   *
   * Deferred via setImmediate to avoid nested transaction / SQLite savepoint errors when the
   * event is emitted from within evaluateResource's transaction (e.g. createMaintenanceFromSchedule).
   */
  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  onMaintenanceChanged(event: ResourceMaintenanceChangedEvent): void {
    const resourceId = event.resourceId;
    if (resourceId == null) return;

    setImmediate(() => {
      this.evaluateResource(resourceId).catch((err) => {
        this.logger.error(
          `Error evaluating schedules for resource ${resourceId} after maintenance changed: ${err}`,
          (err as Error)?.stack,
        );
      });
    });
  }
}
