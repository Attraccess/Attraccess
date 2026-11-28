import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Redis } from 'ioredis';

import type { ValkeyConfigType } from '../../../config/valkey.config';
import { VALKEY_CLIENT } from '../../../valkey/valkey.module';

import { USAGE_SESSION_STORE, UsageSessionStore } from '../usage-session-store.port';

import {
  LocalSessionChangeCoordination,
  SessionChangeCoordination,
  resolveInstanceName,
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
    @Inject(USAGE_SESSION_STORE) private readonly sessions: UsageSessionStore,
    @Inject(VALKEY_CLIENT) private readonly valkeyClient: Redis | null,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Whether other API instances share the machines through Valkey. */
  get distributed(): boolean {
    return Boolean(this.valkeyClient);
  }

  /** Valkey makes the turn per machine hold across API instances; without it this instance's queue is enough. */
  get coordination(): SessionChangeCoordination {
    this.sessionChangeCoordinationInstance ??= this.valkeyClient
      ? new ValkeySessionChangeCoordination(
          this.valkeyClient,
          resolveInstanceName(this.config?.get<ValkeyConfigType>('valkey')?.ATTRACCESS_INSTANCE_NAME),
        )
      : new LocalSessionChangeCoordination();
    return this.sessionChangeCoordinationInstance;
  }

  /**
   * On a machine shared by several people, changes run one at a time so the counts flows see stay consistent.
   * This includes a machine whose limit was lowered to 1 while several sessions still run: their stops close shared
   * meter segments, which must not interleave. A limit of 1 otherwise keeps its immediate conflict.
   */
  async take<T>(resourceId: number, change: () => Promise<T>, withinSessionChange = false): Promise<T> {
    if (withinSessionChange) return change();
    const limit = await this.sessions.findSessionLimit(resourceId);
    const shared = limit > 1 || (await this.sessions.countActiveSessions(resourceId)) > 1;
    return shared
      ? this.sessionChangeQueue.run(resourceId, change, this.sessionChangeWaitMs, this.coordination)
      : this.sessionChangeQueue.runAlongside(resourceId, change);
  }
}
