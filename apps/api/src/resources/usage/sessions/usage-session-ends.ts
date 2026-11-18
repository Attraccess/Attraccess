import { ResourceFlowNodeType, ResourceFormAction, ResourceType } from '@attraccess/application-models';
import type { UsageFormSubmissionDraft, UsageSession, UsageSessionUser } from '@attraccess/application-models';

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { AUDIT_RECORDER, AuditActor, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../../audit/recorder/audit-event';

import type { TransactionScope } from '../../../database/unit-of-work';

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

import { pickSessionToEnd } from './active-usage';

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
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async endSession(
    resourceId: number,
    user: UsageSessionUser,
    dto: EndUsageSessionDto,
    options: EndSessionOptions = {},
  ): Promise<UsageSession> {
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
    user: UsageSessionUser,
    dto: EndUsageSessionDto,
    options: EndSessionOptions,
    attemptId: string,
  ): Promise<UsageSession> {
    // skipNoteNotification: flow-ended sessions carry an auto-generated note, not a human one — skip personnel notification.
    const { skipFormSubmissions = false, skipNoteNotification = false } = options;
    const auditOrigin = options.auditOrigin ?? ({ id: user.id, authenticationMethod: 'session' } satisfies AuditActor);

    this.logger.debug(`Ending session for resource ${resourceId} by user ${user.id}`, { dto });

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let activeSession: UsageSession | null = null;
    let formSubmissions: UsageFormSubmissionDraft[] = [];
    let activeSessionCounts: ActiveSessionCounts | undefined;
    const prepared = await this.lifecycle.transaction(async (scope) => {
      const sessionLimit = await this.lifecycle.getSessionLimit(scope, resourceId);
      const sharedMachine = sessionLimit > 1;
      await this.lifecycle.assertLifecycleAvailable(scope, resourceId, sharedMachine);
      const activeSessions = await this.records.getActiveSessionsForResource(resourceId, scope);
      activeSession = pickSessionToEnd(activeSessions, user, dto.usageId, sessionLimit);
      activeSessionCounts = {
        before: activeSessions.length,
        after: Math.max(0, activeSessions.length - 1),
        limit: sessionLimit,
      };
      if (sharedMachine && (await this.lifecycle.sessions.isSessionBeingEnded(activeSession.id, scope))) {
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
          scope,
        });
      }

      const attempt = await this.lifecycle.sessions.saveAttempt(
        {
          id: attemptId,
          resourceId,
          kind: 'end',
          candidateUsageId: null,
          previousUsageId: activeSession.id,
          transitionTime: endTime,
          formSubmissions,
          billingItems: [],
        },
        scope,
      );
      return { activeSession, updateData, attempt };
    });

    let updatedUsage: UsageSession;
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
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.id ?? options.triggeredByUserId },
      );
      // Stop effects have run; only now read the final total. Failure leaves energy billing pending, not the stop undone.
      const final: FinalCollection = await this.lifecycle.collectFinal(
        prepared.activeSession.id,
        prepared.attempt.transitionTime,
      );
      updatedUsage = await this.lifecycle.transaction(async (scope) => {
        const attempt = await this.lifecycle.getLifecycleAttempt(scope, attemptId, resourceId);
        await this.lifecycle.applyLifecycleDrafts(scope, attempt);
        const ended = await this.lifecycle.sessions.endSessionIfOpen(
          prepared.activeSession.id,
          prepared.updateData,
          scope,
        );
        if (!ended) throw new ConflictException('Usage session changed while ending');
        const endedSession = await this.lifecycle.sessions.findSessionWithRelations(
          prepared.activeSession.id,
          'ended',
          scope,
        );
        chargeTransactionId = await this.lifecycle.settleEndedSession(scope, endedSession, final);
        await this.lifecycle.sessions.deleteAttempt(attemptId, resourceId, scope);
        await this.audit.record(
          {
            domain: 'resource',
            action: 'usage_session.ended',
            actor: auditOrigin,
            subject: { type: 'resource', id: resourceId },
            details: {
              usageId: endedSession.id,
              usageUserId: endedSession.userId,
              ...(options.triggeredByUserId === undefined ? {} : { triggeredByUserId: options.triggeredByUserId }),
            },
          },
          scope,
        );
        return endedSession;
      });
    } catch (error) {
      await this.lifecycle.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    const endedUsageIdToEmit = updatedUsage.id;
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
    manager?: TransactionScope,
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
    manager?: TransactionScope,
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
    manager?: TransactionScope,
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
            auditOrigin: SYSTEM_AUDIT_ACTOR,
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
  private findEndableSession(
    resourceId: number,
    usageId: number,
    context?: TransactionScope,
  ): Promise<UsageSession | null> {
    return this.lifecycle.sessions.findEndableSession(resourceId, usageId, context);
  }

  /** A named user without any active session fails (NO_USAGE_SESSION); one whose session is ending is skipped. */
  private async findEndableSessions(
    resourceId: number,
    target: SessionEndTarget,
    context?: TransactionScope,
  ): Promise<UsageSession[]> {
    const sessions = (await this.records.getActiveSessionsForResource(resourceId, context)).filter(
      (session) => target.kind === 'all' || session.userId === target.userId,
    );
    if (target.kind === 'user' && sessions.length === 0) throw new NoUsageSessionError();
    if (sessions.length === 0) return sessions;
    const endingIds = await this.lifecycle.sessions.findSessionIdsBeingEnded(resourceId, context);
    return sessions.filter((session) => !endingIds.has(session.id));
  }
}
