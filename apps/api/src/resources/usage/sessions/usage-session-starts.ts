import { ResourceFlowNodeType } from '@attraccess/application-models';
import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';

import { BillingService } from '../../../billing/charges/billing.service';

import { FinalCollection } from '../../metering/resource-metering.service';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { TentativeSessionCancelledError } from '../errors/tentative-session-cancelled.error';

import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';

import { RESOURCE_USAGE_LOG_CONTEXT, StartSessionOptions, UsageLifecycle } from '../lifecycle/usage-lifecycle';

import { usageFlowPayload, withDisplayName } from '../lifecycle/usage-flow-payload';

import { UsageSessionEnds } from './usage-session-ends';

import { UsageSessionNotifications } from './usage-session-notifications';

import { UsageSessionStartPreparation } from './usage-session-start-preparation';

/** Starts and takeovers: the tentative session, its flow, and the commit that makes it visible. */
@Injectable()
export class UsageSessionStarts {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly preparation: UsageSessionStartPreparation,
    private readonly gate: UsageResourceGate,
    private readonly ends: UsageSessionEnds,
    private readonly billingService: BillingService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async startSession(
    resourceId: number,
    user: UsageSessionUser,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<UsageSession> {
    const attemptId = randomUUID();
    return this.ends.runSessionChange(resourceId, attemptId, () =>
      this.startSessionNow(resourceId, user, dto, options, attemptId),
    );
  }

  private async startSessionNow(
    resourceId: number,
    user: UsageSessionUser,
    dto: StartUsageSessionDto,
    options: StartSessionOptions,
    attemptId: string,
  ): Promise<UsageSession> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto, options });

    const supervisorUserId = options.supervisorUserId ?? null;
    const auditOrigin = options.auditOrigin ?? ({ id: user.id, authenticationMethod: 'session' } satisfies AuditActor);

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let startedUsageIdToEmit: number | null = null;

    let chargeTransactionId: number | undefined;
    const prepared = await this.preparation.prepareSessionStart(
      resourceId,
      user,
      dto,
      supervisorUserId,
      attemptId,
      options,
    );
    const takeoverEndedUser = prepared.existingActiveSession?.user ?? null;

    let newSession: UsageSession;
    try {
      const { createdSession, existingActiveSession, formSubmissions, attempt, activeSessions } = prepared;
      // The outgoing session's total must be read before the meter is re-initialized for the next one.
      const outgoingFinal: FinalCollection = existingActiveSession
        ? await this.lifecycle.collectFinal(existingActiveSession.id, attempt.transitionTime)
        : { status: 'not-metered' };
      // A billed session must not start unless its meter acknowledged the start; nothing is energized yet.
      await this.lifecycle.initializeMeter({
        resourceId,
        usageId: createdSession.id,
        supersedes: existingActiveSession?.id,
      });
      await this.lifecycle.runUsageFlow(
        undefined,
        resourceId,
        existingActiveSession
          ? ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER
          : ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        existingActiveSession
          ? {
              ...usageFlowPayload(existingActiveSession, formSubmissions),
              takeOverTime: attempt.transitionTime,
              newUser: withDisplayName(user),
              oldUser: existingActiveSession.user
                ? withDisplayName(existingActiveSession.user)
                : existingActiveSession.user,
              activeSessions,
            }
          : { ...usageFlowPayload(createdSession, formSubmissions), activeSessions },
        existingActiveSession ? 'takeover' : 'start',
        // The starter, or the supervisor who started it for them.
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.id ?? user.id },
      );
      newSession = await this.lifecycle.transaction(async (scope) => {
        const currentAttempt = await this.lifecycle.getLifecycleAttempt(scope, attemptId, resourceId);
        if (currentAttempt.candidateUsageId !== createdSession.id) {
          throw new TentativeSessionCancelledError();
        }
        // The flow may have independently triggered maintenance while this start was pending.
        // Recheck the gate before making the candidate session visible.
        await this.gate.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: false }, scope);
        if (existingActiveSession) {
          await this.lifecycle.applyLifecycleDrafts(scope, currentAttempt);
          const ended = await this.lifecycle.sessions.endSessionIfOpen(
            existingActiveSession.id,
            {
              endTime: currentAttempt.transitionTime,
              endNotes: `Session ended due to takeover by user ${user.id}`,
            },
            scope,
          );
          if (!ended) throw new ConflictException('Usage session changed during takeover');
          const endedSession = await this.lifecycle.sessions.findSessionWithRelations(
            existingActiveSession.id,
            'ended',
            scope,
          );
          chargeTransactionId = await this.lifecycle.settleEndedSession(scope, endedSession, outgoingFinal);
        } else {
          startedUsageIdToEmit = createdSession.id;
        }
        // The outgoing charge must affect the final balance check, including same-user takeovers.
        // Both changes remain atomic if the replacement can no longer be afforded.
        await this.billingService.handleResourceUsageStart(resourceId, createdSession, user, scope);
        if (!existingActiveSession) await this.lifecycle.applyLifecycleDrafts(scope, currentAttempt);
        // The attempt row is locked since the read above, so nothing removes the candidate meanwhile; a missing one
        // means the change was cleaned up, and nothing of it (charge, audit) may commit.
        if (!(await this.lifecycle.sessions.publishSession(createdSession.id, scope))) {
          throw new SessionChangeInterruptedError();
        }
        await this.lifecycle.sessions.deleteAttempt(attemptId, resourceId, scope);
        // Audit rows commit or roll back with the session change they describe.
        if (existingActiveSession) {
          await this.audit.record(
            {
              domain: 'resource',
              action: 'usage_session.ended',
              actor: auditOrigin,
              subject: { type: 'resource', id: resourceId },
              details: { usageId: existingActiveSession.id, usageUserId: existingActiveSession.user.id },
            },
            scope,
          );
        }
        await this.audit.record(
          {
            domain: 'resource',
            action: 'usage_session.started',
            actor: auditOrigin,
            subject: { type: 'resource', id: resourceId },
            details: {
              usageId: createdSession.id,
              usageUserId: createdSession.userId,
              ...(supervisorUserId === null ? {} : { supervisorUserId }),
            },
          },
          scope,
        );
        return this.lifecycle.sessions.findSessionWithRelations(createdSession.id, 'started', scope);
      });
    } catch (error) {
      await this.lifecycle.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    await this.notifications.notifySessionStarted(
      resourceId,
      user,
      dto,
      supervisorUserId,
      prepared,
      newSession,
      startedUsageIdToEmit,
      takeoverEndedUser,
      chargeTransactionId,
    );

    return newSession;
  }
}
