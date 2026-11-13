import {
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { IsNull } from 'typeorm';

import { AuditService } from '../../../audit/audit.service';

import { BillingService } from '../../../billing/charges/billing.service';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';

import { FinalCollection } from '../../metering/resource-metering.service';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { TentativeSessionCancelledError } from '../errors/tentative-session-cancelled.error';

import { RESOURCE_USAGE_LOG_CONTEXT, StartSessionOptions, UsageLifecycle } from '../lifecycle/usage-lifecycle';

import { usageFlowPayload } from '../lifecycle/usage-flow-payload';

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
    private readonly audit: AuditService,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async startSession(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<ResourceUsage> {
    const attemptId = randomUUID();
    return this.ends.runSessionChange(resourceId, attemptId, () =>
      this.startSessionNow(resourceId, user, dto, options, attemptId),
    );
  }

  private async startSessionNow(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions,
    attemptId: string,
  ): Promise<ResourceUsage> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto, options });

    const supervisorUserId = options.supervisorUserId ?? null;
    const auditOrigin = options.auditOrigin ?? { actorId: user.id, authenticationMethod: 'session' as const };

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let startedUsageIdToEmit: number | null = null;
    let takeoverEndedUser: User | null = null;

    let chargeTransactionId: number | undefined;
    const prepared = await this.preparation.prepareSessionStart(resourceId, user, dto, supervisorUserId, attemptId);
    takeoverEndedUser = prepared.existingActiveSession?.user ?? null;

    let newSession: ResourceUsage;
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
              newUser: user,
              oldUser: existingActiveSession.user,
              activeSessions,
            }
          : { ...usageFlowPayload(createdSession, formSubmissions), activeSessions },
        existingActiveSession ? 'takeover' : 'start',
        // The starter, or the supervisor who started it for them.
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.actorId ?? user.id },
      );
      newSession = await runSerializedTransaction(this.lifecycle.manager, async (manager) => {
        const currentAttempt = await this.lifecycle.getLifecycleAttempt(manager, attemptId, resourceId);
        if (currentAttempt.candidateUsageId !== createdSession.id) {
          throw new TentativeSessionCancelledError();
        }
        // The flow may have independently triggered maintenance while this start was pending.
        // Recheck the gate before making the candidate session visible.
        await this.gate.getResource(
          resourceId,
          user,
          { checkMaintenance: true, checkControlPermission: false },
          manager,
        );
        if (existingActiveSession) {
          await this.lifecycle.applyLifecycleDrafts(manager, currentAttempt);
          const result = await manager.update(
            ResourceUsage,
            { id: existingActiveSession.id, endTime: IsNull() },
            {
              endTime: currentAttempt.transitionTime,
              endNotes: `Session ended due to takeover by user ${user.id}`,
            },
          );
          if (result.affected === 0) throw new ConflictException('Usage session changed during takeover');
          const endedSession = await manager.findOneOrFail(ResourceUsage, {
            where: { id: existingActiveSession.id },
            relations: ['user', 'resource'],
          });
          chargeTransactionId = await this.lifecycle.settleEndedSession(manager, endedSession, outgoingFinal);
        } else {
          startedUsageIdToEmit = createdSession.id;
        }
        // The outgoing charge must affect the final balance check, including same-user takeovers.
        // Both changes remain atomic if the replacement can no longer be afforded.
        await this.billingService.handleResourceUsageStart(resourceId, createdSession, user, manager);
        if (!existingActiveSession) await this.lifecycle.applyLifecycleDrafts(manager, currentAttempt);
        await manager.update(ResourceUsage, createdSession.id, { isFinalized: true, lifecyclePending: false });
        await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
        // Audit rows commit or roll back with the session change they describe.
        if (existingActiveSession) {
          await this.audit.recordResource(
            {
              action: 'usage_session.ended',
              ...auditOrigin,
              subjectId: resourceId,
              details: { usageId: existingActiveSession.id, usageUserId: existingActiveSession.user.id },
            },
            manager,
          );
        }
        await this.audit.recordResource(
          {
            action: 'usage_session.started',
            ...auditOrigin,
            subjectId: resourceId,
            details: {
              usageId: createdSession.id,
              usageUserId: createdSession.userId,
              ...(supervisorUserId === null ? {} : { supervisorUserId }),
            },
          },
          manager,
        );
        return manager.findOneOrFail(ResourceUsage, {
          where: { id: createdSession.id },
          relations: ['resource', 'user', 'project'],
        });
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
