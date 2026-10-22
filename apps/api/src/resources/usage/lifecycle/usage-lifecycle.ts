import type { FormSubmissionDraft } from '@attraccess/application-models';
import {
  BillingTransaction,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  LifecycleBillingItem,
  Resource,
  ResourceUsageAction,
  User,
  Project,
} from '@attraccess/application-models';

import { ConflictException, Logger } from '@nestjs/common';

import { DatabaseTransactions, TransactionScope } from '../../../database/transaction-scope';
import { UsagePersistence, USAGE_OPERATIONS } from '../persistence/port';
import { FORM_OPERATIONS } from '../../forms/persistence/port';
import { BILLING_OPERATIONS } from '../../../billing/persistence/port';

import { ResourceUsageLifecycleAbortedEvent } from '../events/resource-usage.events';

import { ExternalEffectFailureError } from '../../flows/errors/external-effect-failure.error';

import { FlowExecutionError } from '../../flows/errors/flow-execution.error';

import { SystemEvent } from '@attraccess/plugins-backend-sdk/v2';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Redis } from 'ioredis';

import { AuditService } from '../../../audit/audit.service';

import { BillingService } from '../../../billing/charges/billing.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { PluginEventsService } from '../../../plugin-system/plugin-events.service';

import { ProjectsService } from '../../../projects/projects.service';

import { RbacService } from '../../../users-and-auth/rbac/rbac.service';

import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';

import { ResourceFormsService } from '../../forms/forms.service';

import { ResourceGroupsIntroductionsService } from '../../groups/introductions/resourceGroups.introductions.service';

import { ResourceGroupsService } from '../../groups/resourceGroups.service';

import { ResourceHealthService } from '../../health/resource-health.service';

import { ResourceIntroducersService } from '../../introducers/resourceIntroducers.service';

import { ResourceIntroductionsService } from '../../introductions/resouceIntroductions.service';

import { ResourceMaintenanceService } from '../../maintenances/maintenance.service';

import { ResourceMeteringService } from '../../metering/resource-metering.service';

import { ResourceOperatingAttributionService } from '../../operating-intervals/resource-operating-attribution.service';

import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { ResourceUsageService } from '../sessions/resource-usage.service';
import { ResourceAuditOrigin } from '../../../audit/audit-policy';
export interface EndSessionOptions {
  /** Skip persisting required END-action form submissions (used by automated/flow paths). */
  skipFormSubmissions?: boolean;
  /** Skip emitting ResourceUsageNoteAddedEvent (used when the note is auto-generated, e.g. flow-ended). */
  skipNoteNotification?: boolean;
  auditOrigin?: ResourceAuditOrigin;
}

export interface StartSessionOptions {
  /**
   * When set, the session is started as a supervised session attributed to this supervisor.
   * The supervisor is validated as an introducer for the resource.
   */
  supervisorUserId?: number;
  auditOrigin?: ResourceAuditOrigin;
}

export type UsageFlowPayload = {
  resource: Partial<Resource>;
  user: Partial<User> & Pick<User, 'id'>;
  formSubmissions: {
    [key: string]: { formName: string; answers: { [key: number]: { value: string; name: string } } };
  };
  id: number;
  usageAction: ResourceUsageAction;
  resourceId: number;
  userId: number | null;
  startTime: Date;
  startNotes: string | null;
  endTime: Date | null;
  endNotes: string | null;
  usageInMinutes: number;
  billingTransaction: BillingTransaction | null;
  projectId: number | null;
  project: Project | null;
  isFinalized: boolean;
  lifecyclePending: boolean;
  supervisorUserId: number | null;
  supervisorUser: User | null;
  sessionDurationCreditsPerMinute: number | null;
  operatingDurationCreditsPerMinute: number | null;
  creditsPerUsage: number | null;
  billingFactor: number | null;
  meterRates: ResourceUsage['meterRates'];
  attributedOperatingDurationInMinutes: number | null;
};

export abstract class UsageLifecycle {
  protected async applyLifecycleDrafts(
    manager: TransactionScope,
    attempt: ResourceUsageLifecycleAttempt,
  ): Promise<void> {
    for (const submission of attempt.formSubmissions) {
      await manager.resolve(FORM_OPERATIONS).saveSubmission({
        formId: submission.formId,
        resourceUsageId: submission.resourceUsageId,
        userId: submission.userId,
        action: submission.action,
        data: submission.data,
      });
    }
    for (const { usageId, quantity, ...item } of attempt.billingItems) {
      const transaction = await manager.resolve(BILLING_OPERATIONS).usageTransaction(usageId);
      if (!transaction) throw new ConflictException('The usage billing transaction is missing');
      const existing = await manager.resolve(BILLING_OPERATIONS).matchingItem(transaction.id, item);
      if (existing) {
        await manager.resolve(BILLING_OPERATIONS).updateItemQuantity(existing.id, existing.quantity + quantity);
      } else {
        await manager.resolve(BILLING_OPERATIONS).saveItem({ billingTransactionId: transaction.id, ...item, quantity });
      }
    }
  }

  protected async abortLifecycleAttempt(attemptId: string, resourceId: number): Promise<void> {
    const aborted = await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (manager) => {
      const attempt = await this.usageOperations(manager).attempt(attemptId, resourceId);
      if (!attempt) return false;
      if (attempt.candidateUsageId !== null) {
        await this.metering?.discardCandidate(manager, attempt.candidateUsageId);
        await this.usageOperations(manager).deletePendingCandidate(attempt.candidateUsageId);
      }
      await this.usageOperations(manager).deleteAttempt(attemptId, resourceId);
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
    await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      const result = await this.usageOperations(manager).deletePendingCandidate(attempt.candidateUsageId);
      if (result === 0) throw new ConflictException('The tentative usage session no longer exists');
      // Keep the reservation until the owning flow has settled all of its branches.
      await this.usageOperations(manager).clearAttemptCandidate(attemptId, resourceId);
    });
  }

  /** Claim and discard the candidate before dispatching stopped-flow effects. */
  async endLifecycleCandidate(attemptId: string, resourceId: number, endNotes: string): Promise<void> {
    const candidate = await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      const candidate = await this.usageOperations(manager).candidate(attempt.candidateUsageId);
      if (!candidate) throw new ConflictException('The tentative usage session no longer exists');
      const result = await this.usageOperations(manager).deletePendingCandidate(attempt.candidateUsageId);
      if (result === 0) throw new ConflictException('The tentative usage session no longer exists');
      // Keep the reservation until the owning flow has settled all of its branches.
      await this.usageOperations(manager).clearAttemptCandidate(attemptId, resourceId);
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
    const recoveryResources = await this.persistence.recoveryResourceIds();
    const resourceIds = await this.transactions.run(
      { resourceIds: recoveryResources, accountIds: [] },
      async (manager) => {
        if (
          (await this.usageOperations(manager).recoveryResourceIds()).some(
            (id) => !manager.conflicts.resourceIds.includes(id),
          )
        )
          throw new ConflictException('Usage recovery scope changed');
        const recovered = await this.usageOperations(manager).recoverOrphans();
        if (recovered)
          this.logger.warn(`Cancelled ${recovered} orphan unfinalized usage sessions; see resource_usage_recovery`);
        const attempts = await this.usageOperations(manager).attempts();
        for (const attempt of attempts) {
          if (attempt.candidateUsageId !== null) {
            await this.metering?.discardCandidate(manager, attempt.candidateUsageId);
            await this.usageOperations(manager).deletePendingCandidate(attempt.candidateUsageId);
          }
          await this.usageOperations(manager).deleteAttempt(attempt.id);
        }
        return attempts.map((attempt) => attempt.resourceId);
      },
    );
    for (const resourceId of resourceIds) {
      this.eventEmitter.emit(
        ResourceUsageLifecycleAbortedEvent.EVENT_NAME,
        new ResourceUsageLifecycleAbortedEvent(resourceId),
      );
    }
  }

  protected async runUsageFlow(
    manager: TransactionScope | undefined,
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

  protected async persistAttributedOperatingDuration(usage: ResourceUsage, manager: TransactionScope): Promise<void> {
    const attributedOperatingDurationInMinutes = this.operatingAttributionService
      ? await this.operatingAttributionService.getForUsage(usage, manager)
      : 0;
    await this.usageOperations(manager).setAttributedDuration(usage.id, attributedOperatingDurationInMinutes);
    usage.attributedOperatingDurationInMinutes = attributedOperatingDurationInMinutes;
  }

  protected async assertLifecycleAvailable(manager: TransactionScope, resourceId: number): Promise<void> {
    if (
      (await this.usageOperations(manager).attemptForResource(resourceId)) ||
      (await this.usageOperations(manager).pendingUsageExists(resourceId))
    ) {
      throw new ConflictException('A usage lifecycle operation is already in progress for this resource');
    }
  }

  protected async getLifecycleAttempt(
    manager: TransactionScope,
    id: string,
    resourceId: number,
  ): Promise<ResourceUsageLifecycleAttempt> {
    const attempt = await this.usageOperations(manager).attempt(id, resourceId);
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
    await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (manager) => {
      const attempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
      const targetUsageId = attempt.previousUsageId ?? attempt.candidateUsageId;
      if (targetUsageId === null || (usageId !== undefined && usageId !== targetUsageId)) {
        throw new ConflictException('Billing item does not belong to this usage lifecycle attempt');
      }
      await this.usageOperations(manager).setAttemptBillingItems(attempt.id, [
        ...attempt.billingItems,
        { ...item, usageId: targetUsageId },
      ]);
    });
  }

  protected abstract readonly flowExecutorService: ResourceFlowsExecutorService;

  protected abstract readonly logger: Logger;

  protected abstract readonly operatingAttributionService: ResourceOperatingAttributionService | undefined;

  protected abstract readonly persistence: UsagePersistence;
  protected abstract readonly transactions: DatabaseTransactions;
  protected usageOperations(scope?: TransactionScope): UsagePersistence {
    return scope ? scope.resolve(USAGE_OPERATIONS) : this.persistence;
  }

  protected abstract readonly metering?: ResourceMeteringService;

  protected abstract readonly eventEmitter: EventEmitter2;

  protected abstract getResourceUsageFlowPayload(
    resourceUsage: ResourceUsage,
    formSubmissions?: FormSubmissionDraft[],
  ): UsageFlowPayload;

  protected abstract cacheCleanupInterval: ReturnType<typeof setInterval> | null;

  protected abstract pruneAccessCache(): void;

  protected abstract readonly valkeyClient: Redis | null;

  protected abstract authorizationCacheSubscriber: Redis | null;

  protected abstract readonly accessCache: Map<
    string,
    { userId: number; resourceId: number; result: boolean; expiresAt: number }
  >;

  protected abstract readonly accessCacheKeysByUser: Map<number, Set<string>>;

  protected abstract deleteAccessCacheEntry(key: string): void;

  protected abstract readonly metricsService: MetricsService;

  protected abstract accessCacheGeneration: number;

  protected abstract canControllResourceUncached(
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    scope?: TransactionScope,
  ): Promise<boolean>;

  protected abstract readonly ACCESS_CACHE_TTL_MS: 30000;

  protected abstract readonly resourceRetrainingService: ResourceRetrainingService;

  protected abstract readonly ACCESS_CACHE_MAX_SIZE: 5000;

  protected abstract setAccessCacheEntry(
    key: string,
    entry: { userId: number; resourceId: number; result: boolean; expiresAt: number },
  ): void;

  protected abstract invalidateAccessCache(
    predicate?: (entry: { userId: number; resourceId: number }) => boolean,
  ): void;

  protected abstract invalidateUserAccessCache(userId: number): void;

  protected abstract readonly pluginEvents: PluginEventsService;

  protected abstract readonly accessCacheInFlight: Map<string, { generation: number; result: Promise<boolean> }>;

  protected abstract readonly rbacService: RbacService;

  protected abstract resolveAuthorizationCacheMiss(
    key: string,
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    scope: TransactionScope | undefined,
    generation: number,
  ): Promise<boolean>;

  protected abstract readonly resourceIntroductionService: ResourceIntroductionsService;

  protected abstract readonly resourceIntroducersService: ResourceIntroducersService;

  protected abstract readonly resourceGroupsService: ResourceGroupsService;

  protected abstract readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService;

  public abstract assertSupportsSupervision(
    resourceId: number,
    scope?: TransactionScope,
    preloadedResource?: Resource,
  ): Promise<Resource>;

  protected abstract readonly resourceMaintenanceService: ResourceMaintenanceService;

  protected abstract readonly resourceHealthService: ResourceHealthService;

  public abstract canControllResource(resourceId: number, user: User, scope?: TransactionScope): Promise<boolean>;

  protected abstract getResource(
    resourceId: number,
    user: User,
    opts: { checkMaintenance: boolean; checkControlPermission: boolean },
    scope?: TransactionScope,
  ): Promise<Resource>;

  public abstract validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    scope?: TransactionScope,
    preloadedResource?: Resource,
  ): Promise<void>;

  public abstract getActiveSession(resourceId: number, scope?: TransactionScope): Promise<ResourceUsage | null>;

  protected abstract readonly billingService: BillingService;

  protected abstract readonly projectsService: ProjectsService;

  protected abstract readonly resourceFormsService: ResourceFormsService;

  protected abstract prepareSessionStart(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
  ): Promise<{
    resource: Resource;
    createdSession: ResourceUsage;
    existingActiveSession: ResourceUsage;
    attempt: ResourceUsageLifecycleAttempt;
    formSubmissions: FormSubmissionDraft[];
  }>;

  protected abstract notifySessionStarted(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    auditOrigin: NonNullable<StartSessionOptions['auditOrigin']>,
    prepared: Awaited<ReturnType<ResourceUsageService['prepareSessionStart']>>,
    newSession: ResourceUsage,
    endedUsageIdToEmit: number | null,
    startedUsageIdToEmit: number | null,
    takeoverEndedUser: User | null,
  ): Promise<void>;

  protected abstract readonly audit: AuditService;

  protected abstract emitUsageEvent(usageId: number, scope?: TransactionScope): Promise<void>;

  protected abstract emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: Resource | undefined,
    user: User | undefined,
  ): void;

  protected abstract notifySessionEnded(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    auditOrigin: NonNullable<EndSessionOptions['auditOrigin']>,
    updatedUsage: ResourceUsage,
    endedUsageIdToEmit: number | null,
    activeSession: ResourceUsage | null,
    skipNoteNotification: boolean,
  ): Promise<void>;

  protected abstract handleDoorAction(
    resourceId: number,
    user: User,
    action: ResourceUsageAction,
  ): Promise<ResourceUsage>;
}
