import {
  BillingTransaction,
  BillingTransactionItem,
  FormSubmission,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  LifecycleBillingItem,
  Resource,
  ResourceUsageAction,
  User,
  Project,
} from '@attraccess/database-entities';

import { ConflictException, forwardRef, Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, In, IsNull, Repository } from 'typeorm';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';

import { ResourceUsageLifecycleAbortedEvent } from '../events/resource-usage.events';

import { recoverOrphanedUsages } from '../../../database/resource-usage-integrity';

import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';

import { ExternalEffectFailureError } from '../../flows/errors/external-effect-failure.error';

import { FlowExecutionError } from '../../flows/errors/flow-execution.error';

import { BillingService } from '../../../billing/charges/billing.service';

import { FlowExecutionOptions } from '../../flows/execution/flow-execution.types';
import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';

import { FinalCollection, ResourceMeteringService } from '../../metering/resource-metering.service';

import { ResourceOperatingAttributionService } from '../../operating-intervals/resource-operating-attribution.service';

import { LOCK_TTL_MS, SWEEP_EVERY_MS } from '../sessions/session-change-coordination';
import { SessionChangeTurns } from '../sessions/session-change-turns';
import { activeUsageWhere, sessionLimitOf } from '../sessions/active-usage';
import { AuditActor } from '../../../audit/recorder/audit-event';
import { usageFlowPayload } from './usage-flow-payload';

/** Log context shared by the usage collaborators, so their log lines read as before the split. */
export const RESOURCE_USAGE_LOG_CONTEXT = 'ResourceUsageService';

export interface EndSessionOptions {
  /** Skip persisting required END-action form submissions (used by automated/flow paths). */
  skipFormSubmissions?: boolean;
  /** Skip emitting ResourceUsageNoteAddedEvent (used when the note is auto-generated, e.g. flow-ended). */
  skipNoteNotification?: boolean;
  auditOrigin?: AuditActor;
  /** Flow ends: the user whose action triggered the flow, recorded in the audit entry of the ended session. */
  triggeredByUserId?: number;
  /** Internal: the caller already holds this machine's turn in the session-change queue (deferred flow ends). */
  withinSessionChange?: boolean;
}

export interface StartSessionOptions {
  /**
   * When set, the session is started as a supervised session attributed to this supervisor.
   * The supervisor is validated as an introducer for the resource.
   */
  supervisorUserId?: number;
  auditOrigin?: AuditActor;
}

/** Published usage sessions on the machine around a start, stop or takeover, handed to flows as `activeSessions`. */
export interface ActiveSessionCounts {
  before: number;
  after: number;
  limit: number;
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

/** Lifecycle attempts of starts, stops and takeovers: their drafts, flows, metering, recovery and abort. */
@Injectable()
export class UsageLifecycle {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  private lifecycleSweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    private readonly turns: SessionChangeTurns,
    @Optional() private readonly operatingAttributionService: ResourceOperatingAttributionService | undefined,
    @Inject(forwardRef(() => ResourceFlowsExecutorService))
    private readonly flowExecutorService: ResourceFlowsExecutorService,
    @Optional()
    @Inject(forwardRef(() => ResourceMeteringService))
    private readonly metering?: ResourceMeteringService,
  ) {}

  /** The manager every serialized usage transaction runs on. */
  get manager(): EntityManager {
    return this.resourceUsageRepository.manager;
  }

  /** Whether sessions are metered at all, so their meter rates are worth recording. */
  get metered(): boolean {
    return Boolean(this.metering);
  }

  /** The final meter total of a session, `not-metered` without metering. */
  async collectFinal(usageId: number, at: Date): Promise<FinalCollection> {
    return (await this.metering?.collectFinal(usageId, at)) ?? { status: 'not-metered' };
  }

  async initializeMeter(options: Parameters<ResourceMeteringService['initialize']>[0]): Promise<void> {
    await this.metering?.initialize(options);
  }

  /** Attributes operating time, settles the meter and charges an ended session; returns the charge transaction id. */
  async settleEndedSession(
    manager: EntityManager,
    endedSession: ResourceUsage,
    final: FinalCollection,
  ): Promise<number | undefined> {
    await this.persistAttributedOperatingDuration(endedSession, manager);
    await this.metering?.settleInTransaction(manager, endedSession.id, final);
    return (await this.billingService.chargeForResourceUsage(endedSession, manager))?.id;
  }

  async applyLifecycleDrafts(manager: EntityManager, attempt: ResourceUsageLifecycleAttempt): Promise<void> {
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

  async abortLifecycleAttempt(attemptId: string, resourceId: number): Promise<void> {
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

  /**
   * Claim and discard the candidate before dispatching stopped-flow effects. `actorUserId` is the user whose start
   * or takeover this was; its stop flow runs on their behalf.
   */
  async endLifecycleCandidate(
    attemptId: string,
    resourceId: number,
    endNotes: string,
    actorUserId?: number,
  ): Promise<void> {
    const { candidate, activeSessions } = await runSerializedTransaction(
      this.resourceUsageRepository.manager,
      async (manager) => {
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
        // The start flow counted the candidate as a session; taking it back leaves the published sessions.
        // A takeover counted it in place of the session it replaces, which keeps running now.
        const published = await manager.count(ResourceUsage, { where: { resourceId, ...activeUsageWhere() } });
        const activeSessions: ActiveSessionCounts = {
          before: attempt.kind === 'takeover' ? published : published + 1,
          after: published,
          limit: await this.getSessionLimit(manager, resourceId),
        };
        return { candidate, activeSessions };
      },
    );

    await this.runUsageFlow(
      undefined,
      resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      { ...usageFlowPayload(candidate), endTime: new Date(), endNotes, activeSessions },
      'tentative end',
      { lifecycleAttemptId: attemptId, lifecycleCandidateCancellation: true, actorUserId },
    );
  }

  /**
   * A restart has the same outcome as a rolled-back lifecycle: never replay physical effects. An attempt that
   * another API instance is still working on (it keeps a heartbeat in Valkey) is left alone, so starting one
   * instance does not abort a start or stop in flight on another.
   *
   * With Valkey, every instance repeats this as a `sweep` for attempts left by an instance that crashed while
   * others keep running. A sweep skips attempts younger than the heartbeat's time to live, and one with
   * nothing to clean up does not touch the database.
   */
  public async recoverInterruptedLifecycles(sweep = false): Promise<void> {
    const oldEnough = new Date(Date.now() - LOCK_TTL_MS);
    const attempts = await this.resourceUsageRepository.manager.find(ResourceUsageLifecycleAttempt, {
      select: { id: true, createdAt: true },
    });
    const gone = await this.turns.coordination.findGone(
      attempts.filter(({ createdAt }) => !sweep || createdAt <= oldEnough).map(({ id }) => id),
      !sweep,
    );
    if (sweep && gone.size === 0) return;
    const resourceIds = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
      const recovered = sweep ? 0 : await recoverOrphanedUsages(manager);
      if (recovered)
        this.logger.warn(`Cancelled ${recovered} orphan unfinalized usage sessions; see resource_usage_recovery`);
      const attempts = gone.size
        ? await manager.find(ResourceUsageLifecycleAttempt, { where: { id: In([...gone]) } })
        : [];
      for (const attempt of attempts) {
        if (attempt.candidateUsageId !== null) {
          await this.metering?.discardCandidate(manager, attempt.candidateUsageId);
          await manager.delete(ResourceUsage, { id: attempt.candidateUsageId, lifecyclePending: true });
        }
        await manager.delete(ResourceUsageLifecycleAttempt, attempt.id);
      }
      return attempts.map((attempt) => attempt.resourceId);
    });
    for (const resourceId of new Set(resourceIds)) {
      this.eventEmitter.emit(
        ResourceUsageLifecycleAbortedEvent.EVENT_NAME,
        new ResourceUsageLifecycleAbortedEvent(resourceId),
      );
    }
  }

  /** Other instances share the machines through Valkey, so a crashed one can leave an attempt no restart cleans up. */
  startSweep(): void {
    if (!this.turns.distributed) return;
    let sweeping = false;
    this.lifecycleSweepInterval = setInterval(() => {
      if (sweeping) return;
      sweeping = true;
      this.recoverInterruptedLifecycles(true)
        .catch((error: unknown) =>
          this.logger.warn(`Sweeping interrupted usage lifecycles failed: ${(error as Error).message}`),
        )
        .finally(() => (sweeping = false));
    }, SWEEP_EVERY_MS);
    this.lifecycleSweepInterval.unref?.();
  }

  stopSweep(): void {
    if (this.lifecycleSweepInterval) {
      clearInterval(this.lifecycleSweepInterval);
      this.lifecycleSweepInterval = null;
    }
  }

  async runUsageFlow(
    manager: EntityManager | undefined,
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    payload: object,
    description: string,
    options: Pick<FlowExecutionOptions, 'lifecycleAttemptId' | 'lifecycleCandidateCancellation' | 'actorUserId'>,
  ): Promise<void> {
    try {
      await this.flowExecutorService.runFlow(resourceId, triggerNodeType, payload, manager, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Usage ${description} flow failed for resource ${resourceId}: ${message}`, error);
      if (error instanceof ExternalEffectFailureError || error instanceof FlowExecutionError) {
        throw error;
      }
    }
  }

  private async persistAttributedOperatingDuration(usage: ResourceUsage, manager: EntityManager): Promise<void> {
    const attributedOperatingDurationInMinutes = this.operatingAttributionService
      ? await this.operatingAttributionService.getForUsage(usage, manager)
      : 0;
    await manager.update(ResourceUsage, usage.id, { attributedOperatingDurationInMinutes });
    usage.attributedOperatingDurationInMinutes = attributedOperatingDurationInMinutes;
  }

  /** Effective number of parallel sessions. Doors and unknown resources behave like a limit of 1. */
  async getSessionLimit(manager: EntityManager, resourceId: number): Promise<number> {
    const resource = await manager.findOne(Resource, {
      where: { id: resourceId },
      select: { id: true, type: true, maxParallelSessions: true },
    });
    return sessionLimitOf(resource);
  }

  /**
   * With a limit of 1 any lifecycle in progress blocks the resource, as before. With several parallel
   * sessions only a takeover reservation (exclusive) blocks; capacity and one-session-per-person are
   * enforced by the caller, and the same session cannot be ended twice (unique attempt index).
   */
  async assertLifecycleAvailable(manager: EntityManager, resourceId: number, sharedMachine = false): Promise<void> {
    if (sharedMachine) {
      if (await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId, kind: 'takeover' } })) {
        throw new ConflictException('A usage lifecycle operation is already in progress for this resource');
      }
      return;
    }
    if (
      (await manager.findOne(ResourceUsageLifecycleAttempt, { where: { resourceId } })) ||
      (await manager.findOne(ResourceUsage, { where: { resourceId, endTime: IsNull(), lifecyclePending: true } }))
    ) {
      throw new ConflictException('A usage lifecycle operation is already in progress for this resource');
    }
  }

  async getLifecycleAttempt(
    manager: EntityManager,
    id: string,
    resourceId: number,
  ): Promise<ResourceUsageLifecycleAttempt> {
    const attempt = await manager.findOne(ResourceUsageLifecycleAttempt, { where: { id, resourceId } });
    if (!attempt) throw new SessionChangeInterruptedError();
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
