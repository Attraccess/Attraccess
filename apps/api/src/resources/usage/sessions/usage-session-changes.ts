import { ResourceUsage, ResourceUsageLifecycleAttempt, User } from '@attraccess/database-entities';

import { ConflictException } from '@nestjs/common';

import { EntityManager } from 'typeorm';

import { NoUsageSessionError } from '../../flows/errors/no-usage-session.error';

import { sessionLimitOf } from '../lifecycle/usage-lifecycle';

import { UsageAuthorization } from '../authorization/usage-authorization';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { EndSessionOptions } from '../lifecycle/usage-lifecycle';

import { SessionChangeQueue } from './session-change-queue';

export type SessionEndTarget = { kind: 'user'; userId: number } | { kind: 'all' };

/**
 * Serializes the session changes of a machine shared by several people and lets flows end sessions of a user
 * or of everybody. Kept apart from the start/stop lifecycle itself.
 */
export abstract class UsageSessionChanges extends UsageAuthorization {
  private readonly sessionChangeQueue = new SessionChangeQueue();

  /** Ends of other sessions requested by a start or stop flow; they run once that start or stop has finished. */
  private readonly deferredSessionEnds = new Map<string, Array<() => Promise<unknown>>>();

  /**
   * On a machine shared by several people, starts, stops and takeovers run one at a time so the counts flows see
   * stay consistent. A limit of 1 keeps its immediate conflict. Deferred ends run after the queue is released.
   */
  protected async runSessionChange<T>(resourceId: number, attemptId: string, task: () => Promise<T>): Promise<T> {
    let result: T;
    try {
      const limit = sessionLimitOf(
        await this.resourceRepository.findOne({
          where: { id: resourceId },
          select: { id: true, type: true, maxParallelSessions: true },
        }),
      );
      result = limit > 1 ? await this.sessionChangeQueue.run(resourceId, task) : await task();
    } catch (error) {
      this.deferredSessionEnds.delete(attemptId);
      throw error;
    }
    const deferred = this.deferredSessionEnds.get(attemptId) ?? [];
    this.deferredSessionEnds.delete(attemptId);
    for (const end of deferred) {
      await end().catch((error: unknown) =>
        this.logger.error(`Deferred session end failed for resource ${resourceId}`, error),
      );
    }
    return result;
  }

  /** Called by the flow end-session node from within a start or stop flow; fails now if a user has no session. */
  async deferSessionEnds(
    attemptId: string,
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
  ): Promise<void> {
    const sessions = await this.findEndableSessions(resourceId, target, manager);
    if (target.kind === 'user' && sessions.length === 0) throw new NoUsageSessionError();
    const ends = this.deferredSessionEnds.get(attemptId) ?? [];
    ends.push(() => this.endSessionsOfTarget(resourceId, target, notes));
    this.deferredSessionEnds.set(attemptId, ends);
  }

  /** Ends the sessions a flow names. Sessions that are already being ended are skipped. */
  async endSessionsOfTarget(
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
  ): Promise<void> {
    const sessions = await this.findEndableSessions(resourceId, target, manager);
    if (target.kind === 'user' && sessions.length === 0) throw new NoUsageSessionError();
    let firstError: unknown;
    for (const session of sessions) {
      try {
        await this.endSession(
          resourceId,
          session.user,
          { notes, usageId: session.id },
          { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
        );
      } catch (error) {
        if (error instanceof ConflictException) continue;
        // Another run ended it between listing and ending: nothing left to do for this session.
        if (await this.isSessionGone(resourceId, session.id, manager)) continue;
        this.logger.warn(`Ending session ${session.id} of resource ${resourceId} from a flow failed`);
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  private async isSessionGone(resourceId: number, usageId: number, manager?: EntityManager): Promise<boolean> {
    const stillActive = await this.getActiveSessionsForResource(resourceId, manager);
    return !stillActive.some((session) => session.id === usageId);
  }

  private async findEndableSessions(
    resourceId: number,
    target: SessionEndTarget,
    manager?: EntityManager,
  ): Promise<ResourceUsage[]> {
    const sessions = (await this.getActiveSessionsForResource(resourceId, manager)).filter(
      (session) => target.kind === 'all' || session.userId === target.userId,
    );
    if (sessions.length === 0) return sessions;
    const beingEnded = await (manager ?? this.resourceUsageRepository.manager).find(ResourceUsageLifecycleAttempt, {
      where: { resourceId, kind: 'end' },
    });
    const endingIds = new Set(beingEnded.map((attempt) => attempt.previousUsageId));
    return sessions.filter((session) => !endingIds.has(session.id));
  }

  abstract endSession(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options?: EndSessionOptions,
  ): Promise<ResourceUsage>;
}
