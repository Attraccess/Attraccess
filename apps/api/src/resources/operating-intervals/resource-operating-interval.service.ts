import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceOperatingStateChangedEvent } from './events/resource-operating-state-changed.event';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';

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
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
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
        runSerializedTransaction(this.intervalRepository.manager, (manager) =>
          this.persistTransitionWithConflictHandling(resourceId, state, manager, provenance),
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
    manager: EntityManager,
    provenance?: OperatingTransitionProvenance,
  ): Promise<ResourceOperatingInterval | null> {
    try {
      return await this.persistTransition(resourceId, state, manager, provenance);
    } catch (error) {
      if (state === 'operating' && this.isOpenIntervalUniqueConflict(error)) {
        return null;
      }
      throw error;
    }
  }

  private async persistTransition(
    resourceId: number,
    state: ResourceOperatingState,
    manager: EntityManager,
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
      return repository.save(openInterval);
    }

    if (openInterval) {
      return null;
    }

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

  private isOpenIntervalUniqueConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const code = (error as QueryFailedError & { code?: string | number }).code;
    return code === '23505' || (code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed'));
  }
}
