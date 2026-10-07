import {
  FormSubmission,
  ResourceFlowNodeType,
  ResourceFormAction,
  ResourceType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IsNull } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { FinalCollection } from '../metering/resource-metering.service';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionOptions } from './resourceUsage.service.feature-definitions';
import { UsageStartNotificationsImplementation } from './usage-start-notifications';
export abstract class UsageSessionEndImplementation extends UsageStartNotificationsImplementation {
  async endSession(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options: EndSessionOptions = {},
  ): Promise<ResourceUsage> {
    // skipNoteNotification: flow-ended sessions carry an auto-generated note, not a human one — skip personnel notification.
    const { skipFormSubmissions = false, skipNoteNotification = false } = options;
    const auditOrigin = options.auditOrigin ?? { actorId: user.id, authenticationMethod: 'session' as const };

    this.logger.debug(`Ending session for resource ${resourceId} by user ${user.id}`, { dto });

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let activeSession: ResourceUsage | null = null;
    let endedUsageIdToEmit: number | null = null;
    let formSubmissions: FormSubmission[] = [];
    const attemptId = randomUUID();
    const prepared = await runSerializedTransaction(
      this.resourceUsageRepository.manager,
      async (transactionalEntityManager) => {
        await this.assertLifecycleAvailable(transactionalEntityManager, resourceId);
        activeSession = await this.getActiveSession(resourceId, transactionalEntityManager);
        if (!activeSession) {
          throw new BadRequestException('No active session found');
        }

        // Prefer already-populated effectivePermissions on the request-bound user (set by SessionStrategy)
        const userPermissions =
          (user as AuthenticatedUser).effectivePermissions ?? (await this.rbacService.getEffectivePermissions(user.id));
        const canUpdateResources = userPermissions.has('resources.update');
        const isSessionOwner = activeSession.user.id === user.id;
        // The supervisor of a supervised session may end it as well.
        const isSupervisor = activeSession.supervisorUserId != null && activeSession.supervisorUserId === user.id;

        if (!isSessionOwner && !isSupervisor && !canUpdateResources) {
          const canMaintain = await this.resourceIntroducersService.canMaintain(
            activeSession.resourceId,
            user.id,
            true,
          );
          if (!canMaintain) {
            this.logger.warn(
              `User ${user.id} not authorized to end session ${activeSession.id} owned by user ${activeSession.user.id}`,
            );
            throw new ForbiddenException('You are not authorized to end this session');
          }
        }

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
      },
    );

    let updatedUsage: ResourceUsage;
    let chargeTransactionId: number | undefined;
    try {
      await this.runUsageFlow(
        undefined,
        resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        { ...this.getResourceUsageFlowPayload(prepared.activeSession, formSubmissions), ...prepared.updateData },
        'end',
        attemptId,
      );
      // Stop effects have run; only now read the final total. Failure leaves energy billing pending, not the stop undone.
      const final: FinalCollection = (await this.metering?.collectFinal(
        prepared.activeSession.id,
        prepared.attempt.transitionTime,
      )) ?? { status: 'not-metered' };
      updatedUsage = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
        const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
        await this.applyLifecycleDrafts(manager, attempt);
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
        await this.persistAttributedOperatingDuration(endedSession, manager);
        await this.metering?.settleInTransaction(manager, endedSession.id, final);
        chargeTransactionId = (await this.billingService.chargeForResourceUsage(endedSession, manager))?.id;
        await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
        return endedSession;
      });
    } catch (error) {
      await this.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    endedUsageIdToEmit = updatedUsage.id;
    if (chargeTransactionId !== undefined) await this.billingService.notifyResourceUsageCharge(chargeTransactionId);
    await this.notifySessionEnded(
      resourceId,
      user,
      dto,
      auditOrigin,
      updatedUsage,
      endedUsageIdToEmit,
      activeSession,
      skipNoteNotification,
    );

    return updatedUsage;
  }
}
