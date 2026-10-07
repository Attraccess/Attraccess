import {
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { MeteringLateSettlementImplementation } from './metering-late-settlement';
import { MeteringOperationError, MeteringTimeoutError } from './resource-metering.service.route-context';
export abstract class MeteringOperationQueueImplementation extends MeteringLateSettlementImplementation {
  // ---- meter definition -------------------------------------------------------------------------
  // ---- lifecycle --------------------------------------------------------------------------------
  // ---- reconciliation ---------------------------------------------------------------------------
  // ---- interim readings -------------------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE)
  async collectInterimReadings(): Promise<void> {
    const rows = await this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        status: ResourceMeteringSessionStatus.Active,
      })
      .getMany();
    const active = new Set(rows.map((session) => session.id));
    for (const id of this.interimAttempts.keys()) if (!active.has(id)) this.interimAttempts.delete(id);
    for (const session of rows) {
      try {
        const { collect } = await this.getDefinition(session.resourceId);
        if (collect.interimIntervalMinutes === 0) continue;
        const attempt = this.interimAttempts.get(session.id);
        if (attempt?.running) continue;
        const last = Math.max((session.latestObservedAt ?? session.createdAt).getTime(), attempt?.at ?? 0);
        if (Date.now() - last < collect.interimIntervalMinutes * 60_000) continue;
        const busy = await this.sessions.manager.findOne(ResourceUsageLifecycleAttempt, {
          where: { resourceId: session.resourceId },
        });
        if (busy) continue;
        this.interimAttempts.set(session.id, { at: Date.now(), running: true });
        try {
          await this.runOperation(session, 'interim', {
            trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
            timeoutSeconds: collect.timeoutSeconds,
          });
        } finally {
          this.interimAttempts.set(session.id, { at: Date.now(), running: false });
        }
      } catch (error) {
        this.logger.warn(`Interim metering for resource ${session.resourceId} failed: ${this.reason(error)}`);
      }
    }
  }

  // ---- operations -------------------------------------------------------------------------------

  protected enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(resourceId) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.queues.set(resourceId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(resourceId) === next) this.queues.delete(resourceId);
      });
    return next;
  }

  protected runOperation(
    session: ResourceMeteringSession,
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation> {
    return this.enqueue(session.resourceId, async () => {
      const requestedAt = new Date();
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        resourceId: session.resourceId,
        kind,
        status: 'pending',
        requestedAt,
      } as ResourceMeteringOperation);
      if (options.freshAfter) this.freshAfter.set(operation.id, options.freshAfter);
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.flows.runFlow(
            session.resourceId,
            options.trigger,
            {
              metering: {
                sessionId: session.id,
                operationId: operation.id,
                resourceId: session.resourceId,
                usageId: session.usageId,
                kind,
                requestedAt: requestedAt.toISOString(),
              },
            },
            undefined,
            {
              metering: { operationId: operation.id, kind, complete: (report) => this.complete(operation.id, report) },
            },
          ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new MeteringTimeoutError(options.timeoutSeconds)),
              options.timeoutSeconds * 1000,
            );
          }),
        ]);
      } catch (error) {
        await this.close(
          operation.id,
          error instanceof MeteringTimeoutError ? 'expired' : 'failed',
          this.reason(error),
        );
        throw error;
      } finally {
        clearTimeout(timer);
        this.freshAfter.delete(operation.id);
      }
      const done = await this.operations.findOneByOrFail({ id: operation.id });
      if (done.status !== 'completed') {
        const message = `The ${kind === 'start' ? 'start' : 'collection'} branch finished without ${kind === 'start' ? 'acknowledging' : 'reporting'}`;
        await this.close(operation.id, 'failed', message);
        throw new MeteringOperationError(message);
      }
      return done;
    });
  }

  protected async close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void> {
    await this.operations.update({ id: operationId, status: 'pending' }, { status, error, completedAt: new Date() });
  }

  protected reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
