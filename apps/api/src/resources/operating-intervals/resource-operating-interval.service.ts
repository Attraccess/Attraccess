import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { IsNull, Repository } from 'typeorm';

export type ResourceOperatingState = 'operating' | 'idle';

@Injectable()
export class ResourceOperatingIntervalService {
  private readonly transitionChains = new Map<number, Promise<unknown>>();

  constructor(
    @InjectRepository(ResourceOperatingInterval)
    private readonly intervalRepository: Repository<ResourceOperatingInterval>,
  ) {}

  async transition(resourceId: number, state: ResourceOperatingState): Promise<ResourceOperatingInterval | null> {
    const previous = this.transitionChains.get(resourceId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.persistTransition(resourceId, state));
    this.transitionChains.set(resourceId, next);

    try {
      return await next;
    } finally {
      if (this.transitionChains.get(resourceId) === next) {
        this.transitionChains.delete(resourceId);
      }
    }
  }

  private async persistTransition(
    resourceId: number,
    state: ResourceOperatingState,
  ): Promise<ResourceOperatingInterval | null> {
    // The transition timestamp is deliberately taken inside the server-side transaction.
    return this.intervalRepository.manager.transaction(async (manager) => {
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

      return repository.save(
        repository.create({
          resourceId,
          startTime: new Date(),
          endTime: null,
        }),
      );
    });
  }
}
