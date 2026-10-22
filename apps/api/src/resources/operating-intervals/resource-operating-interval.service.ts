import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseTransactions } from '../../database/transaction-scope';
import {
  OPERATING_INTERVAL_WRITES,
  OpenOperatingIntervalConflictError,
  OperatingIntervalOperations,
} from './persistence/port';
import { ResourceOperatingInterval } from '@attraccess/application-models';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceOperatingStateChangedEvent } from './events/resource-operating-state-changed.event';

export type ResourceOperatingState = 'operating' | 'idle';

export interface OperatingTransitionProvenance {
  flowNodeId: string;
  flowRunId?: string;
}

/**
 * Writes the authoritative machine operating timeline: one interval row per operating stretch.
 *
 * RETENTION GUARANTEE (ATT-1024): interval rows are retained indefinitely. No cleanup, retention or
 * purge job may delete from `resource_operating_interval`; rows only disappear with their resource
 * (database-level ON DELETE CASCADE). Derived views must be rebuildable from this timeline forever.
 */
@Injectable()
export class ResourceOperatingIntervalService {
  private readonly transitionChains = new Map<number, Promise<unknown>>();

  constructor(
    private readonly transactions: DatabaseTransactions,
    private readonly operatingMetrics: OperatingMetricsRecorder,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async transition(
    resourceId: number,
    state: ResourceOperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    const result = await this.runSerialized(resourceId, state, provenance);

    // A null result means the resource was already in the target state (or a duplicate operating
    // transition lost the unique-index race), so the timeline still reflects `state` afterwards.
    this.operatingMetrics.recordTransition(state, result !== null);
    this.operatingMetrics.setResourceState(resourceId, state);
    if (result) {
      this.eventEmitter.emit(
        ResourceOperatingStateChangedEvent.EVENT_NAME,
        new ResourceOperatingStateChangedEvent(resourceId, state),
      );
    }
    return result;
  }

  private async runSerialized(
    resourceId: number,
    state: ResourceOperatingState,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    const previous = this.transitionChains.get(resourceId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() =>
        this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, (scope) =>
          this.persistTransitionWithConflictHandling(
            resourceId,
            state,
            scope.resolve(OPERATING_INTERVAL_WRITES),
            provenance,
          ),
        ),
      );
    this.transitionChains.set(resourceId, next);

    try {
      return await next;
    } finally {
      if (this.transitionChains.get(resourceId) === next) {
        this.transitionChains.delete(resourceId);
      }
    }
  }

  private async persistTransitionWithConflictHandling(
    resourceId: number,
    state: ResourceOperatingState,
    operations: OperatingIntervalOperations,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    try {
      return await this.persistTransition(resourceId, state, operations, provenance);
    } catch (error) {
      if (state === 'operating' && error instanceof OpenOperatingIntervalConflictError) {
        return null;
      }
      throw error;
    }
  }

  private async persistTransition(
    resourceId: number,
    state: ResourceOperatingState,
    operations: OperatingIntervalOperations,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    await operations.lockResource(resourceId);
    const latestInterval = await operations.latestInterval(resourceId);
    // Read the clock after obtaining the write lock so queued assignments use their application time.
    const transitionTime = new Date();
    const lastTransitionTime = latestInterval?.endTime ?? latestInterval?.startTime;
    if (lastTransitionTime && transitionTime < lastTransitionTime) {
      throw new ConflictException('Server clock precedes the last operating transition');
    }
    const openInterval = latestInterval?.endTime === null ? latestInterval : null;

    if (state === 'idle') {
      if (!openInterval) {
        return null;
      }

      openInterval.endTime = transitionTime;
      openInterval.endFlowNodeId = provenance?.flowNodeId ?? null;
      openInterval.endFlowRunId = provenance?.flowRunId ?? null;
      return operations.saveInterval(openInterval);
    }

    if (openInterval) {
      return null;
    }

    // The transition timestamp is deliberately taken inside the server-side transaction.
    return operations.createInterval({
      resourceId,
      startTime: transitionTime,
      endTime: null,
      startFlowNodeId: provenance?.flowNodeId ?? null,
      startFlowRunId: provenance?.flowRunId ?? null,
      endFlowNodeId: null,
      endFlowRunId: null,
    });
  }
}
