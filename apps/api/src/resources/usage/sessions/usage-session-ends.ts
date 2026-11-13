import {
  FormSubmission,
  ResourceFlowNodeType,
  ResourceFormAction,
  ResourceType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { EntityManager, IsNull } from 'typeorm';

import { AuditService } from '../../../audit/audit.service';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';

import { NoUsageSessionError } from '../../flows/errors/no-usage-session.error';

import { ResourceFormsService } from '../../forms/forms.service';

import { FinalCollection } from '../../metering/resource-metering.service';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { TentativeSessionCancelledError } from '../errors/tentative-session-cancelled.error';

import { MachineBusyError } from '../errors/machine-busy.error';

import {
  ActiveSessionCounts,
  EndSessionOptions,
  RESOURCE_USAGE_LOG_CONTEXT,
  UsageLifecycle,
} from '../lifecycle/usage-lifecycle';

import { usageFlowPayload } from '../lifecycle/usage-flow-payload';

import { activeUsageWhere, pickSessionToEnd } from './active-usage';

import { SessionChangeTurns } from './session-change-turns';

import { UsageSessionNotifications } from './usage-session-notifications';

import { UsageSessionRecords } from './usage-session-records';

export type SessionEndTarget = { kind: 'user'; userId: number } | { kind: 'all' };

/** Sessions a start or stop flow asked to end, picked when its end-session node ran. */
interface DeferredSessionEnds {
  usageIds: number[];
  notes: string;
  triggeredByUserId?: number;
}

/**
 * Stops, the turn every session change takes on its machine, and the ends of a user's or everybody's sessions
 * that flows ask for.
 */
@Injectable()
export class UsageSessionEnds {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly records: UsageSessionRecords,
    private readonly gate: UsageResourceGate,
    private readonly turns: SessionChangeTurns,
    private readonly resourceFormsService: ResourceFormsService,
    private readonly audit: AuditService,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async endSession(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options: EndSessionOptions = {},
  ): Promise<ResourceUsage> {
    const attemptId = randomUUID();
    return this.runSessionChange(
      resourceId,
      attemptId,
      () => this.endSessionNow(resourceId, user, dto, options, attemptId),
      options.withinSessionChange,
    );
  }

  private async endSessionNow(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options: EndSessionOptions,
    attemptId: string,
  ): Promise<ResourceUsage> {
    // skipNoteNotification: flow-ended sessions carry an auto-generated note, not a human one — skip personnel notification.
    const { skipFormSubmissions = false, skipNoteNotification = false } = options;
    const auditOrigin = options.auditOrigin ?? { actorId: user.id, authenticationMethod: 'session' as const };

    this.logger.debug(`Ending session for resource ${resourceId} by user ${user.id}`, { dto });

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let activeSession: ResourceUsage | null = null;
    let endedUsageIdToEmit: number | null = null;
    let formSubmissions: FormSubmission[] = [];
    let activeSessionCounts: ActiveSessionCounts | undefined;
    const prepared = await runSerializedTransaction(this.lifecycle.manager, async (transactionalEntityManager) => {
      const sessionLimit = await this.lifecycle.getSessionLimit(transactionalEntityManager, resourceId);
      const sharedMachine = sessionLimit > 1;
      await this.lifecycle.assertLifecycleAvailable(transactionalEntityManager, resourceId, sharedMachine);
      const activeSessions = await this.records.getActiveSessionsForResource(resourceId, transactionalEntityManager);
      activeSession = pickSessionToEnd(activeSessions, user, dto.usageId, sessionLimit);
      activeSessionCounts = {
        before: activeSessions.length,
        after: Math.max(0, activeSessions.length - 1),
        limit: sessionLimit,
      };
      if (
        sharedMachine &&
        (await transactionalEntityManager.findOne(ResourceUsageLifecycleAttempt, {
          where: { previousUsageId: activeSession.id },
        }))
      ) {
        // Changes of this machine take turns, so this is a stop cut off by a crash that is not cleaned up yet.
        throw new MachineBusyError();
      }

      const isSessionOwner = await this.gate.assertMayEndSession(activeSession, user);

      const endTime = new Date();
      let endNotes = dto.notes;
      if (!isSessionOwner) {
        endNotes = `[By #${user.id} - ${user.username}] ${endNotes ?? ''}`;
      }

      this.logger.debug(`Ending session ${activeSession.id} at ${endTime.toISOString()}`);

      const updateData = {
        endTime,
        endNotes,
      };

      if (!skipFormSubmissions && activeSession.resource?.type === ResourceType.Machine) {
        formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
          resourceId,
          action: ResourceFormAction.END,
          submissions: dto.formSubmissions,
          userId: user.id,
          resourceUsageId: activeSession.id,
          manager: transactionalEntityManager,
        });
      }

      const attempt = await transactionalEntityManager.save(ResourceUsageLifecycleAttempt, {
        id: attemptId,
        resourceId,
        kind: 'end',
        candidateUsageId: null,
        previousUsageId: activeSession.id,
        transitionTime: endTime,
        formSubmissions,
        billingItems: [],
      });
      return { activeSession, updateData, attempt };
    });

    let updatedUsage: ResourceUsage;
    let chargeTransactionId: number | undefined;
    try {
      await this.lifecycle.runUsageFlow(
        undefined,
        resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        {
          ...usageFlowPayload(prepared.activeSession, formSubmissions),
          ...prepared.updateData,
          activeSessions: activeSessionCounts,
        },
        'end',
        // The requester stops it (maybe someone else's session); a flow end passes on the user who caused it.
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.actorId ?? options.triggeredByUserId },
      );
      // Stop effects have run; only now read the final total. Failure leaves energy billing pending, not the stop undone.
      const final: FinalCollection = await this.lifecycle.collectFinal(
        prepared.activeSession.id,
        prepared.attempt.transitionTime,
      );
      updatedUsage = await runSerializedTransaction(this.lifecycle.manager, async (manager) => {
        const attempt = await this.lifecycle.getLifecycleAttempt(manager, attemptId, resourceId);
        await this.lifecycle.applyLifecycleDrafts(manager, attempt);
        const result = await manager.update(
          ResourceUsage,
          { id: prepared.activeSession.id, endTime: IsNull() },
          prepared.updateData,
        );
        if (result.affected === 0) throw new ConflictException('Usage session changed while ending');
        const endedSession = await manager.findOneOrFail(ResourceUsage, {
          where: { id: prepared.activeSession.id },
          relations: ['user', 'resource'],
        });
        chargeTransactionId = await this.lifecycle.settleEndedSession(manager, endedSession, final);
        await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
        await this.audit.recordResource(
          {
            action: 'usage_session.ended',
            ...auditOrigin,
            subjectId: resourceId,
            details: {
              usageId: endedSession.id,
              usageUserId: endedSession.userId,
              ...(options.triggeredByUserId === undefined ? {} : { triggeredByUserId: options.triggeredByUserId }),
            },
          },
          manager,
        );
        return endedSession;
      });
    } catch (error) {
      await this.lifecycle.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    endedUsageIdToEmit = updatedUsage.id;
    await this.notifications.notifySessionEnded(
      resourceId,
      user,
      dto,
      updatedUsage,
      endedUsageIdToEmit,
      activeSession,
      skipNoteNotification,
      chargeTransactionId,
    );

    return updatedUsage;
  }

  /**
   * On a machine shared by several people, starts, stops and takeovers run one at a time so the counts flows see
   * stay consistent. A limit of 1 keeps its immediate conflict. Ends deferred by the change's flows run right
   * after it, while the machine is still held, so no other start or stop slips in between.
   */
  async runSessionChange<T>(
    resourceId: number,
    attemptId: string,
    task: () => Promise<T>,
    withinSessionChange = false,
  ): Promise<T> {
    return this.turns.take(
      resourceId,
      () => this.runChangeThenDeferredEnds(resourceId, attemptId, task),
      withinSessionChange,
    );
  }

  private async runChangeThenDeferredEnds<T>(resourceId: number, attemptId: string, task: () => Promise<T>) {
    // Tells a restarting instance that this attempt is being worked on, so it leaves it alone.
    const stopKeepAlive = this.turns.coordination.keepAlive(attemptId);
    try {
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
    } finally {
      stopKeepAlive();
    }
  }

  /** Ends of other sessions requested by a start or stop flow; they run once that start or stop has finished. */
  private readonly deferredSessionEnds = new Map<string, DeferredSessionEnds[]>();

  private async runDeferredSessionEnds(resourceId: number, attemptId: string): Promise<void> {
    const deferred = this.deferredSessionEnds.get(attemptId) ?? [];
    this.deferredSessionEnds.delete(attemptId);
    for (const { usageIds, notes, triggeredByUserId } of deferred) {
      await this.endSessionsById(resourceId, usageIds, notes, true, undefined, triggeredByUserId).catch(
        (error: unknown) => this.logger.error(`Deferred session end failed for resource ${resourceId}`, error),
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
    triggeredByUserId?: number,
  ): Promise<void> {
    const sessions = await this.findEndableSessions(resourceId, target, manager);
    if (sessions.length === 0) return;
    const ends = this.deferredSessionEnds.get(attemptId) ?? [];
    ends.push({ usageIds: sessions.map((session) => session.id), notes, triggeredByUserId });
    this.deferredSessionEnds.set(attemptId, ends);
  }

  /** Ends the sessions a flow names. Sessions that are already being ended are skipped. */
  async endSessionsOfTarget(
    resourceId: number,
    target: SessionEndTarget,
    notes: string,
    manager?: EntityManager,
    triggeredByUserId?: number,
  ): Promise<void> {
    const sessions = await this.findEndableSessions(resourceId, target, manager);
    await this.endSessionsById(
      resourceId,
      sessions.map((session) => session.id),
      notes,
      false,
      manager,
      triggeredByUserId,
    );
  }

  private async endSessionsById(
    resourceId: number,
    usageIds: number[],
    notes: string,
    withinSessionChange: boolean,
    manager?: EntityManager,
    triggeredByUserId?: number,
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
            triggeredByUserId,
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
    manager: EntityManager = this.lifecycle.manager,
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

  /** A named user without any active session fails (NO_USAGE_SESSION); one whose session is ending is skipped. */
  private async findEndableSessions(
    resourceId: number,
    target: SessionEndTarget,
    manager?: EntityManager,
  ): Promise<ResourceUsage[]> {
    const sessions = (await this.records.getActiveSessionsForResource(resourceId, manager)).filter(
      (session) => target.kind === 'all' || session.userId === target.userId,
    );
    if (target.kind === 'user' && sessions.length === 0) throw new NoUsageSessionError();
    if (sessions.length === 0) return sessions;
    const beingEnded = await (manager ?? this.lifecycle.manager).find(ResourceUsageLifecycleAttempt, {
      where: { resourceId, kind: 'end' },
    });
    const endingIds = new Set(beingEnded.map((attempt) => attempt.previousUsageId));
    return sessions.filter((session) => !endingIds.has(session.id));
  }
}
