import {
  BillingTransaction,
  BillingTransactionItem,
  FormSubmission,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ConflictException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { ResourceUsageLifecycleAbortedEvent } from './events/resource-usage.events';
import { UsageLifecycleFlowImplementation } from './usage-lifecycle-flow';
import { recoverOrphanedUsages } from '../../database/resource-usage-integrity';

export abstract class UsageLifecycleDraftsImplementation extends UsageLifecycleFlowImplementation {
  protected async applyLifecycleDrafts(manager: EntityManager, attempt: ResourceUsageLifecycleAttempt): Promise<void> {
    for (const submission of attempt.formSubmissions) {
      await manager.save(FormSubmission, {
        formId: submission.formId,
        resourceUsageId: submission.resourceUsageId,
        userId: submission.userId,
        action: submission.action,
        data: submission.data,
      });
    }
    for (const { usageId, quantity, ...item } of attempt.billingItems) {
      const transaction = await manager.findOne(BillingTransaction, { where: { resourceUsageId: usageId } });
      if (!transaction) throw new ConflictException('The usage billing transaction is missing');
      const where = {
        billingTransactionId: transaction.id,
        ...item,
        description: item.description === null ? IsNull() : item.description,
        externalReference: item.externalReference === null ? IsNull() : item.externalReference,
      };
      const existing = await manager.findOne(BillingTransactionItem, { where });
      if (existing) {
        await manager.update(BillingTransactionItem, existing.id, { quantity: existing.quantity + quantity });
      } else {
        await manager.save(BillingTransactionItem, { billingTransactionId: transaction.id, ...item, quantity });
      }
    }
  }

  protected async abortLifecycleAttempt(attemptId: string, resourceId: number): Promise<void> {
    const aborted = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const attempt = await manager.findOne(ResourceUsageLifecycleAttempt, { where: { id: attemptId, resourceId } });
      if (!attempt) return false;
      if (attempt.candidateUsageId !== null) {
        await this.metering?.discardCandidate(manager, attempt.candidateUsageId);
        await manager.delete(ResourceUsage, { id: attempt.candidateUsageId, lifecyclePending: true });
      }
      await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
      return true;
    });
    if (aborted)
      this.eventEmitter.emit(
        ResourceUsageLifecycleAbortedEvent.EVENT_NAME,
        new ResourceUsageLifecycleAbortedEvent(resourceId),
      );
  }

  /** A flow may end the tentative session it was started for before it becomes visible. */
  async cancelLifecycleCandidate(attemptId: string, resourceId: number): Promise<void> {
    await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      const result = await manager.delete(ResourceUsage, { id: attempt.candidateUsageId, lifecyclePending: true });
      if (result.affected === 0) throw new ConflictException('The tentative usage session no longer exists');
      // Keep the reservation until the owning flow has settled all of its branches.
      await manager.update(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId }, { candidateUsageId: null });
    });
  }

  /** Claim and discard the candidate before dispatching stopped-flow effects. */
  async endLifecycleCandidate(attemptId: string, resourceId: number, endNotes: string): Promise<void> {
    const candidate = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      const candidate = await manager.findOneOrFail(ResourceUsage, {
        where: { id: attempt.candidateUsageId, lifecyclePending: true },
        relations: ['resource', 'user', 'project'],
      });
      const result = await manager.delete(ResourceUsage, { id: attempt.candidateUsageId, lifecyclePending: true });
      if (result.affected === 0) throw new ConflictException('The tentative usage session no longer exists');
      // Keep the reservation until the owning flow has settled all of its branches.
      await manager.update(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId }, { candidateUsageId: null });
      return candidate;
    });

    await this.runUsageFlow(
      undefined,
      resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      { ...this.getResourceUsageFlowPayload(candidate), endTime: new Date(), endNotes },
      'tentative end',
      attemptId,
      true,
    );
  }

  /** A restart has the same outcome as a rolled-back lifecycle: never replay physical effects. */
  public async recoverInterruptedLifecycles(): Promise<void> {
    const resourceIds = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const recovered = await recoverOrphanedUsages(manager);
      if (recovered)
        this.logger.warn(`Cancelled ${recovered} orphan unfinalized usage sessions; see resource_usage_recovery`);
      const attempts = await manager.find(ResourceUsageLifecycleAttempt);
      for (const attempt of attempts) {
        if (attempt.candidateUsageId !== null) {
          await this.metering?.discardCandidate(manager, attempt.candidateUsageId);
          await manager.delete(ResourceUsage, { id: attempt.candidateUsageId, lifecyclePending: true });
        }
        await manager.delete(ResourceUsageLifecycleAttempt, attempt.id);
      }
      return attempts.map((attempt) => attempt.resourceId);
    });
    for (const resourceId of resourceIds) {
      this.eventEmitter.emit(
        ResourceUsageLifecycleAbortedEvent.EVENT_NAME,
        new ResourceUsageLifecycleAbortedEvent(resourceId),
      );
    }
  }
}
