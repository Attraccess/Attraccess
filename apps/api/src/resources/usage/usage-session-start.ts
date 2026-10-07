import {
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsNull } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { FinalCollection } from '../metering/resource-metering.service';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { StartSessionOptions } from './resourceUsage.service.feature-definitions';
import { UsageStartPreparationImplementation } from './usage-start-preparation';
export abstract class UsageSessionStartImplementation extends UsageStartPreparationImplementation {
  async startSession(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<ResourceUsage> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto, options });

    const supervisorUserId = options.supervisorUserId ?? null;
    const auditOrigin = options.auditOrigin ?? { actorId: user.id, authenticationMethod: 'session' as const };

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let endedUsageIdToEmit: number | null = null;
    let startedUsageIdToEmit: number | null = null;
    let takeoverEndedUser: User | null = null;

    const attemptId = randomUUID();
    let chargeTransactionId: number | undefined;
    const prepared = await this.prepareSessionStart(resourceId, user, dto, supervisorUserId, attemptId);
    takeoverEndedUser = prepared.existingActiveSession?.user ?? null;

    let newSession: ResourceUsage;
    try {
      const { createdSession, existingActiveSession, formSubmissions, attempt } = prepared;
      // The outgoing session's total must be read before the meter is re-initialized for the next one.
      const outgoingFinal: FinalCollection = existingActiveSession
        ? ((await this.metering?.collectFinal(existingActiveSession.id, attempt.transitionTime)) ?? {
            status: 'not-metered',
          })
        : { status: 'not-metered' };
      // A billed session must not start unless its meter acknowledged the start; nothing is energized yet.
      if ((createdSession.energyCreditsPerKwh ?? 0) > 0) {
        if (!this.metering) throw new Error('Energy billing requires the metering service');
        await this.metering.initialize({
          resourceId,
          usageId: createdSession.id,
          creditsPerKwh: createdSession.energyCreditsPerKwh as number,
          supersedes: existingActiveSession?.id,
        });
      }
      await this.runUsageFlow(
        undefined,
        resourceId,
        existingActiveSession
          ? ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER
          : ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        existingActiveSession
          ? {
              ...this.getResourceUsageFlowPayload(existingActiveSession, formSubmissions),
              takeOverTime: attempt.transitionTime,
              newUser: user,
              oldUser: existingActiveSession.user,
            }
          : this.getResourceUsageFlowPayload(createdSession, formSubmissions),
        existingActiveSession ? 'takeover' : 'start',
        attemptId,
      );
      newSession = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
        const currentAttempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
        if (currentAttempt.candidateUsageId !== createdSession.id) {
          throw new ConflictException('The tentative usage session was cancelled');
        }
        // The flow may have independently triggered maintenance while this start was pending.
        // Recheck the gate before making the candidate session visible.
        await this.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: false }, manager);
        if (existingActiveSession) {
          await this.applyLifecycleDrafts(manager, currentAttempt);
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
          await this.persistAttributedOperatingDuration(endedSession, manager);
          await this.metering?.settleInTransaction(manager, endedSession.id, outgoingFinal);
          chargeTransactionId = (await this.billingService.chargeForResourceUsage(endedSession, manager))?.id;
          endedUsageIdToEmit = endedSession.id;
        } else {
          startedUsageIdToEmit = createdSession.id;
        }
        // The outgoing charge must affect the final balance check, including same-user takeovers.
        // Both changes remain atomic if the replacement can no longer be afforded.
        await this.billingService.handleResourceUsageStart(resourceId, createdSession, user, manager);
        if (!existingActiveSession) await this.applyLifecycleDrafts(manager, currentAttempt);
        await manager.update(ResourceUsage, createdSession.id, { isFinalized: true, lifecyclePending: false });
        await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
        return manager.findOneOrFail(ResourceUsage, {
          where: { id: createdSession.id },
          relations: ['resource', 'user', 'project'],
        });
      });
    } catch (error) {
      await this.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    if (chargeTransactionId !== undefined) await this.billingService.notifyResourceUsageCharge(chargeTransactionId);
    this.flowExecutorService.trackResourceActivity(resourceId);
    await this.notifySessionStarted(
      resourceId,
      user,
      dto,
      supervisorUserId,
      auditOrigin,
      prepared,
      newSession,
      endedUsageIdToEmit,
      startedUsageIdToEmit,
      takeoverEndedUser,
    );

    return newSession;
  }
}
