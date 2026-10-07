import {
  LifecycleBillingItem,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { FlowExecutionError } from '../flows/errors/flow-execution.error';
import { ResourceUsageServiceRouteContext } from './resourceUsage.service.route-context';
export abstract class UsageLifecycleFlowImplementation extends ResourceUsageServiceRouteContext {
  protected async runUsageFlow(
    manager: EntityManager | undefined,
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    payload: object,
    description: string,
    lifecycleAttemptId?: string,
    lifecycleCandidateCancellation = false,
  ): Promise<void> {
    try {
      await this.flowExecutorService.runFlow(
        resourceId,
        triggerNodeType,
        payload,
        manager,
        lifecycleCandidateCancellation
          ? { lifecycleAttemptId, lifecycleCandidateCancellation: true }
          : { lifecycleAttemptId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Usage ${description} flow failed for resource ${resourceId}: ${message}`, error);
      if (error instanceof ExternalEffectFailureError || error instanceof FlowExecutionError) {
        throw error;
      }
    }
  }

  protected async persistAttributedOperatingDuration(usage: ResourceUsage, manager: EntityManager): Promise<void> {
    const attributedOperatingDurationInMinutes = this.operatingAttributionService
      ? await this.operatingAttributionService.getForUsage(usage, manager)
      : 0;
    await manager.update(ResourceUsage, usage.id, { attributedOperatingDurationInMinutes });
    usage.attributedOperatingDurationInMinutes = attributedOperatingDurationInMinutes;
  }

  protected async assertLifecycleAvailable(manager: EntityManager, resourceId: number): Promise<void> {
    if (await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } })) {
      throw new ConflictException('A usage lifecycle operation is already in progress for this resource');
    }
  }

  protected async getLifecycleAttempt(
    manager: EntityManager,
    id: string,
    resourceId: number,
  ): Promise<ResourceUsageLifecycleAttempt> {
    const attempt = await manager.findOne(ResourceUsageLifecycleAttempt, { where: { id, resourceId } });
    if (!attempt) throw new ConflictException('The usage lifecycle attempt is no longer active');
    return attempt;
  }

  /** Billing flow effects belong to the attempt until the entire lifecycle succeeds. */
  async stageLifecycleBillingItem(
    attemptId: string,
    resourceId: number,
    usageId: number | undefined,
    item: Omit<LifecycleBillingItem, 'usageId'>,
  ): Promise<void> {
    await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      const targetUsageId = attempt.previousUsageId ?? attempt.candidateUsageId;
      if (targetUsageId === null || (usageId !== undefined && usageId !== targetUsageId)) {
        throw new ConflictException('Billing item does not belong to this usage lifecycle attempt');
      }
      await manager.update(ResourceUsageLifecycleAttempt, attempt.id, {
        billingItems: [...attempt.billingItems, { ...item, usageId: targetUsageId }],
      });
    });
  }
}
