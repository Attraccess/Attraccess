import { ResourceUsage, ResourceUsageLifecycleAttempt, User } from '@attraccess/database-entities';

import { EntityManager } from 'typeorm';

import { NoUsageSessionError } from '../../flows/errors/no-usage-session.error';

import { UsageAuthorization } from '../authorization/usage-authorization';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { TentativeSessionCancelledError } from '../errors/tentative-session-cancelled.error';

import { EndSessionOptions } from '../lifecycle/usage-lifecycle';

import { activeUsageWhere, sessionLimitOf } from './active-usage';

import { SessionChangeQueue } from './session-change-queue';

export type SessionEndTarget = { kind: 'user'; userId: number } | { kind: 'all' };

/** Sessions a start or stop flow asked to end, picked when its end-session node ran. */
interface DeferredSessionEnds {
  usageIds: number[];
  notes: string;
}

/**
 * Serializes the session changes of a machine shared by several people and lets flows end sessions of a user
 * or of everybody. Kept apart from the start/stop lifecycle itself.
 */
export abstract class UsageSessionChanges extends UsageAuthorization {
  private readonly sessionChangeQueue = new SessionChangeQueue();

  /** Ends of other sessions requested by a start or stop flow; they run once that start or stop has finished. */
  private readonly deferredSessionEnds = new Map<string, DeferredSessionEnds[]>();

  /**
   * On a machine shared by several people, starts, stops and takeovers run one at a time so the counts flows see
   * stay consistent. A limit of 1 keeps its immediate conflict. Ends deferred by the change's flows run right
   * after it, while the machine is still held, so no other start or stop slips in between.
   */
  protected async runSessionChange<T>(
    resourceId: number,
    attemptId: string,
    task: () => Promise<T>,
    withinSessionChange = false,
  ): Promise<T> {
    const change = () => this.runChangeThenDeferredEnds(resourceId, attemptId, task);
    if (withinSessionChange) return change();
    const limit = sessionLimitOf(
      await this.resourceRepository.findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      }),
    );
    return limit > 1
      ? this.sessionChangeQueue.run(resourceId, change)
      : this.sessionChangeQueue.runAlongside(resourceId, change);
  }

  private async runChangeThenDeferredEnds<T>(resourceId: number, attemptId: string, task: () => Promise<T>) {
    let result: T;
    try {
      result = await task();
    } catch (error) {
      // A start flow that ended its own new session finished on purpose: the ends it asked for still apply.
      if (error instanceof TentativeSessionCancelledError) await this.runDeferredSessionEnds(resourceId, attemptId);
      else this.deferredSessionEnds.delete(attemptId);
      throw error;
    }
    await this.runDeferredSessionEnds(resourceId, attemptId);
    return result;
  }

  private async runDeferredSessionEnds(resourceId: number, attemptId: string): Promise<void> {
    const deferred = this.deferredSessionEnds.get(attemptId) ?? [];
    this.deferredSessionEnds.delete(attemptId);
    for (const { usageIds, notes } of deferred) {
      await this.endSessionsById(resourceId, usageIds, notes, true).catch((error: unknown) =>
        this.logger.error(`Deferred session end failed for resource ${resourceId}`, error),
      );
    }
  }

  /**
   * Called by the flow end-session node from within a start or stop flow; fails now if a user has no session.
   * The sessions are picked now, so the session being started is never among them.
   */
  async deferSessionEnds(
    attemptId: string,
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
  ): Promise<void> {
    const sessions = await this.findEndableSessions(resourceId, target, manager);
    if (target.kind === 'user' && sessions.length === 0) throw new NoUsageSessionError();
    if (sessions.length === 0) return;
    const ends = this.deferredSessionEnds.get(attemptId) ?? [];
    ends.push({ usageIds: sessions.map((session) => session.id), notes });
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
    await this.endSessionsById(
      resourceId,
      sessions.map((session) => session.id),
      notes,
      false,
      manager,
    );
  }

  private async endSessionsById(
    resourceId: number,
    usageIds: number[],
    notes: string,
    withinSessionChange: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    let firstError: unknown;
    for (const usageId of usageIds) {
      // Another run may have ended it, or be ending it, since it was picked: nothing left to do then.
      const session = await this.findEndableSession(resourceId, usageId, manager);
      if (!session) continue;
      try {
        await this.endSession(
          resourceId,
          session.user,
          { notes, usageId },
          {
            skipFormSubmissions: true,
            skipNoteNotification: true,
            auditOrigin: { actorId: null },
            withinSessionChange,
          },
        );
      } catch (error) {
        if (!(await this.findEndableSession(resourceId, usageId, manager))) continue;
        this.logger.warn(`Ending session ${usageId} of resource ${resourceId} from a flow failed`);
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  /** The published session, unless it has ended or another stop is already ending it. */
  private async findEndableSession(
    resourceId: number,
    usageId: number,
    manager: EntityManager = this.resourceUsageRepository.manager,
  ): Promise<ResourceUsage | null> {
    const session = await manager.findOne(ResourceUsage, {
      where: { id: usageId, resourceId, ...activeUsageWhere() },
      relations: ['user'],
    });
    if (!session) return null;
    const beingEnded = await manager.exists(ResourceUsageLifecycleAttempt, {
      where: { resourceId, kind: 'end', previousUsageId: usageId },
    });
    return beingEnded ? null : session;
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
