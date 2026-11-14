import { Resource } from '@attraccess/database-entities';

import { Inject, Injectable } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Redis } from 'ioredis';

import { Repository } from 'typeorm';

import { VALKEY_CLIENT } from '../../../valkey/valkey.module';

import { sessionLimitOf } from './active-usage';

import {
  LocalSessionChangeCoordination,
  SessionChangeCoordination,
  ValkeySessionChangeCoordination,
} from './session-change-coordination';

import { SESSION_CHANGE_WAIT_MS, SessionChangeQueue } from './session-change-queue';

/** The turn a start, stop or takeover takes on its machine, on this instance and, with Valkey, on every other. */
@Injectable()
export class SessionChangeTurns {
  private readonly sessionChangeQueue = new SessionChangeQueue();

  /** How long a start, stop or takeover waits for the previous one on the same shared machine. */
  private sessionChangeWaitMs = SESSION_CHANGE_WAIT_MS;

  private sessionChangeCoordinationInstance: SessionChangeCoordination | undefined;

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @Inject(VALKEY_CLIENT) private readonly valkeyClient: Redis | null,
  ) {}

  /** Whether other API instances share the machines through Valkey. */
  get distributed(): boolean {
    return Boolean(this.valkeyClient);
  }

  /** Valkey makes the turn per machine hold across API instances; without it this instance's queue is enough. */
  get coordination(): SessionChangeCoordination {
    this.sessionChangeCoordinationInstance ??= this.valkeyClient
      ? new ValkeySessionChangeCoordination(this.valkeyClient)
      : new LocalSessionChangeCoordination();
    return this.sessionChangeCoordinationInstance;
  }

  /**
   * On a machine shared by several people, changes run one at a time so the counts flows see stay consistent.
   * A limit of 1 keeps its immediate conflict.
   */
  async take<T>(resourceId: number, change: () => Promise<T>, withinSessionChange = false): Promise<T> {
    if (withinSessionChange) return change();
    const limit = sessionLimitOf(
      await this.resourceRepository.findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      }),
    );
    return limit > 1
      ? this.sessionChangeQueue.run(resourceId, change, this.sessionChangeWaitMs, this.coordination)
      : this.sessionChangeQueue.runAlongside(resourceId, change);
  }
}
