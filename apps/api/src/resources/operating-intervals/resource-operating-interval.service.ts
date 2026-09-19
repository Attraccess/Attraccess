import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';

export type ResourceOperatingState = 'operating' | 'idle';

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
  ) {}

  async transition(
    resourceId: number,
    state: ResourceOperatingState,
    transactionManager?: EntityManager,
  ): Promise<ResourceOperatingInterval | null> {
    const result = transactionManager
      ? await this.persistTransitionWithConflictHandling(resourceId, state, transactionManager)
      : await this.runSerialized(resourceId, state);

    // A null result means the resource was already in the target state (or a duplicate operating
    // transition lost the unique-index race), so the timeline still reflects `state` afterwards.
    this.operatingMetrics.recordTransition(state, result !== null);
    this.operatingMetrics.setResourceState(resourceId, state);
    return result;
  }

  private async runSerialized(
    resourceId: number,
    state: ResourceOperatingState,
  ): Promise<ResourceOperatingInterval | null> {
    const previous = this.transitionChains.get(resourceId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() =>
        this.intervalRepository.manager.transaction((manager) =>
          this.persistTransitionWithConflictHandling(resourceId, state, manager),
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
  ): Promise<ResourceOperatingInterval | null> {
    try {
      return await this.persistTransition(resourceId, state, manager);
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
  ): Promise<ResourceOperatingInterval | null> {
    // Updating the parent row acquires a database-backed per-resource write lock.
    await manager.query('UPDATE "resource" SET "id" = "id" WHERE "id" = ?', [resourceId]);

    const repository = manager.getRepository(ResourceOperatingInterval);
    const openInterval = await repository.findOne({
      where: { resourceId, endTime: IsNull() },
    });

    if (state === 'idle') {
      if (!openInterval) {
        return null;
      }

      openInterval.endTime = new Date();
      return repository.save(openInterval);
    }

    if (openInterval) {
      return null;
    }

    // The transition timestamp is deliberately taken inside the server-side transaction.
    return repository.save(
      repository.create({
        resourceId,
        startTime: new Date(),
        endTime: null,
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
