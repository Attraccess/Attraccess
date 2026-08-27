import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';

export type ResourceOperatingState = 'operating' | 'idle';

@Injectable()
export class ResourceOperatingIntervalService {
  private readonly transitionChains = new Map<number, Promise<unknown>>();

  constructor(
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
  ) {}

  async transition(
    resourceId: number,
    state: ResourceOperatingState,
    transactionManager?: EntityManager,
  ): Promise<ResourceOperatingInterval | null> {
    if (transactionManager) {
      return this.persistTransitionWithConflictHandling(resourceId, state, transactionManager);
    }

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
