import type { AutoEndReason } from '../session-duration/session-duration.rules';
import { ResourceFlowNodeType } from '@attraccess/application-models';
import type {
  UsageBillingItemDraft,
  UsageLifecycleAttempt,
  UsageSession,
  UsageSessionWithParties,
} from '@attraccess/application-models';

import { BadRequestException, ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { TransactionScope, UNIT_OF_WORK, UnitOfWork, runWithRetry } from '../../../database/unit-of-work';

import { ResourceUsageLifecycleAbortedEvent } from '../events/resource-usage.events';

import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';

import { ExternalEffectFailureError } from '../../flows/errors/external-effect-failure.error';

import { FlowExecutionError } from '../../flows/errors/flow-execution.error';

import { BillingService } from '../../../billing/charges/billing.service';

import { FlowExecutionOptions } from '../../flows/execution/flow-execution.types';
import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';

import { FinalCollection, ResourceMeteringService } from '../../metering/resource-metering.service';

import { ResourceOperatingAttributionService } from '../../operating-intervals/resource-operating-attribution.service';

import { OperatingShare } from '../../operating-intervals/operating-share';

import { LOCK_TTL_MS, SWEEP_EVERY_MS } from '../sessions/session-change-coordination';
import { SessionChangeTurns } from '../sessions/session-change-turns';
import { AuditActor } from '../../../audit/recorder/audit-event';
import type { PreStartOrigin } from '@attraccess/plugins-backend-sdk';
import type { ReaderUiLanguage } from '../../../plugin-system/reader-ui/host-texts';
import { usageFlowPayload } from './usage-flow-payload';
import {
  FormImageUnavailableError,
  MissingBillingTransactionError,
  USAGE_SESSION_STORE,
  UsageSessionStore,
} from '../usage-session-store.port';

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
  /**
   * The automatic end: why the session ends. Also makes the end conditional on the deadline still having passed when
   * the machine's turn is taken, so an extension that wins the race keeps the session running.
   */
  autoEndReason?: AutoEndReason;
}

export interface StartSessionOptions {
  /**
   * When set, the session is started as a supervised session attributed to this supervisor.
   * The supervisor is validated as an introducer for the resource.
   */
  supervisorUserId?: number;
  auditOrigin?: AuditActor;
  /**
   * Where the start came from, for the plugins' atomic capacity hook. Defaults to `supervision` for a supervised
   * start and `web` otherwise.
   */
  origin?: PreStartOrigin;
  /** Language of the refusal text on a reader (the card session's); otherwise the user's language is resolved. */
  language?: ReaderUiLanguage;
  /** plugin -> step keys the user confirmed in this start attempt (from the pre-start gate). */
  confirmedStepKeys?: Record<string, string[]>;
  /**
   * Whether the client can ask the user for a duration estimate (the web, API clients and readers with a duration
   * input). A start that cannot ask is never refused for the missing estimate; the machine's maximum or default
   * estimate sets its deadline instead.
   */
  canAskDuration?: boolean;
}

/** Published usage sessions on the machine around a start, stop or takeover, handed to flows as `activeSessions`. */
export interface ActiveSessionCounts {
  before: number;
  after: number;
  limit: number;
}

/**
 * The tentative session of a project switch is the running session itself, under another project: cancelling it
 * would run the stop flow of a machine that keeps running. A switch flow that fails refuses the switch instead.
 */
function assertCandidateMayBeCancelled(attempt: UsageLifecycleAttempt): void {
  if (attempt.kind === 'project-switch') {
    throw new FlowExecutionError(
      'A project switch flow cannot end the session being switched; name a user or all sessions to end them after the switch',
    );
  }
}

/** Lifecycle attempts of starts, stops and takeovers: their drafts, flows, metering, recovery and abort. */
@Injectable()
export class UsageLifecycle {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  private lifecycleSweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(USAGE_SESSION_STORE) readonly sessions: UsageSessionStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    private readonly turns: SessionChangeTurns,
    @Optional() private readonly operatingAttributionService: ResourceOperatingAttributionService | undefined,
    private readonly flowExecutorService: ResourceFlowsExecutorService,
    @Optional()
    private readonly metering?: ResourceMeteringService,
  ) {}

  /**
   * Runs one short, atomic database phase of a session change. External effects (device commands, payments, mails)
   * never belong in `work`: it runs again when the database asks for a retry (a deadlock or serialization conflict,
   * see `runWithRetry`). They go through `scope.afterCommit` or run after the phase returned. Inside a unit of work
   * the caller already holds, the phase joins it and the owner of that unit of work decides about retries.
   */
  transaction<T>(work: (scope: TransactionScope) => Promise<T>): Promise<T> {
    if (this.unitOfWork.current()?.isOpen) return this.unitOfWork.run(work);
    return runWithRetry(this.unitOfWork, work);
  }

  /** Whether sessions are metered at all, so their meter rates are worth recording. */
  get metered(): boolean {
    return Boolean(this.metering);
  }

  /** The final meter total of a session, `not-metered` without metering. */
  async collectFinal(usageId: number, at: Date): Promise<FinalCollection> {
    return (await this.metering?.collectFinal(usageId, at)) ?? { status: 'not-metered' };
  }

  /**
   * Splits the metering of a running session between it and its continuation after a project switch; a billed meter
   * that cannot be read refuses the switch.
   */
  async handOverMeters(usageId: number, successorUsageId: number, at: Date): Promise<FinalCollection> {
    try {
      return (await this.metering?.handOver(usageId, successorUsageId, at)) ?? { status: 'not-metered' };
    } catch (error) {
      throw new BadRequestException(`METER_SWITCH_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async initializeMeter(options: Parameters<ResourceMeteringService['initialize']>[0]): Promise<void> {
    await this.metering?.initialize(options);
  }

  /** Attributes operating time, settles the meter and charges an ended session; returns the charge transaction id. */
  async settleEndedSession(
    scope: TransactionScope,
    endedSession: UsageSessionWithParties,
    final: FinalCollection,
  ): Promise<number | undefined> {
    const operatingShare = await this.persistAttributedOperatingDuration(endedSession, scope);
    await this.metering?.settleInTransaction(scope, endedSession.id, final);
    const charge = operatingShare?.shared
      ? await this.billingService.chargeForResourceUsage(endedSession, scope, operatingShare)
      : await this.billingService.chargeForResourceUsage(endedSession, scope);
    return charge?.id;
  }

  async applyLifecycleDrafts(context: TransactionScope, attempt: UsageLifecycleAttempt): Promise<void> {
    try {
      await this.sessions.applyAttemptDrafts(attempt, context);
    } catch (error) {
      if (error instanceof MissingBillingTransactionError || error instanceof FormImageUnavailableError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async abortLifecycleAttempt(attemptId: string, resourceId: number): Promise<void> {
    const aborted = await this.transaction(async (scope) => {
      const attempt = await this.sessions.findAttempt(attemptId, resourceId, scope);
      if (!attempt) return false;
      await this.discardAttemptState(scope, attempt);
      await this.sessions.deleteAttempt(attemptId, resourceId, scope);
      return true;
    });
    if (aborted)
      this.eventEmitter.emit(
        ResourceUsageLifecycleAbortedEvent.EVENT_NAME,
        new ResourceUsageLifecycleAbortedEvent(resourceId),
      );
  }

  /** Removes the tentative session of an attempt and gives the session it was about to end back to the meter. */
  private async discardAttemptState(scope: TransactionScope, attempt: UsageLifecycleAttempt): Promise<void> {
    if (attempt.candidateUsageId !== null) {
      await this.metering?.discardCandidate(scope, attempt.candidateUsageId);
      await this.sessions.deletePendingSession(attempt.candidateUsageId, scope);
    }
    // The session a stop or takeover was about to end keeps running, so it still shares the meter.
    if (attempt.previousUsageId !== null) await this.metering?.restoreParticipant(scope, attempt.previousUsageId);
  }

  /** A flow may end the tentative session it was started for before it becomes visible. */
  async cancelLifecycleCandidate(attemptId: string, resourceId: number): Promise<void> {
    await this.transaction(async (scope) => {
      const attempt = await this.getLifecycleAttempt(scope, attemptId, resourceId);
      assertCandidateMayBeCancelled(attempt);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      if (!(await this.sessions.deletePendingSession(attempt.candidateUsageId, scope))) {
        throw new ConflictException('The tentative usage session no longer exists');
      }
      // Keep the reservation until the owning flow has settled all of its branches.
      await this.sessions.clearAttemptCandidate(attemptId, resourceId, scope);
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
    const { candidate, activeSessions } = await this.transaction(async (scope) => {
      const attempt = await this.getLifecycleAttempt(scope, attemptId, resourceId);
      assertCandidateMayBeCancelled(attempt);
      if (attempt.candidateUsageId === null) {
        throw new ConflictException('The usage lifecycle attempt has no candidate session');
      }
      const candidate = await this.sessions.findPendingSession(attempt.candidateUsageId, scope);
      if (!candidate) throw new ConflictException('The tentative usage session no longer exists');
      if (!(await this.sessions.deletePendingSession(attempt.candidateUsageId, scope))) {
        throw new ConflictException('The tentative usage session no longer exists');
      }
      // Keep the reservation until the owning flow has settled all of its branches.
      await this.sessions.clearAttemptCandidate(attemptId, resourceId, scope);
      // The start flow counted the candidate as a session; taking it back leaves the published sessions.
      // A takeover counted it in place of the session it replaces, which keeps running now.
      const published = await this.sessions.countActiveSessions(resourceId, scope);
      const activeSessions: ActiveSessionCounts = {
        before: attempt.kind === 'takeover' ? published : published + 1,
        after: published,
        limit: await this.getSessionLimit(scope, resourceId),
      };
      return { candidate, activeSessions };
    });

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
    const attempts = await this.sessions.listAttemptIds();
    const gone = await this.turns.coordination.findGone(
      attempts.filter(({ createdAt }) => !sweep || createdAt <= oldEnough).map(({ id }) => id),
      !sweep,
    );
    if (sweep && gone.size === 0) return;
    const resourceIds = await this.transaction(async (scope) => {
      const recovered = sweep ? 0 : await this.sessions.recoverOrphanedSessions(scope);
      if (recovered)
        this.logger.warn(`Cancelled ${recovered} orphan unfinalized usage sessions; see resource_usage_recovery`);
      const attempts = await this.sessions.findAttemptsByIds([...gone], scope);
      for (const attempt of attempts) {
        await this.discardAttemptState(scope, attempt);
        await this.sessions.deleteAttempt(attempt.id, attempt.resourceId, scope);
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
    scope: TransactionScope | undefined,
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    payload: object,
    description: string,
    options: Pick<FlowExecutionOptions, 'lifecycleAttemptId' | 'lifecycleCandidateCancellation' | 'actorUserId'>,
  ): Promise<void> {
    try {
      await this.flowExecutorService.runFlow(resourceId, triggerNodeType, payload, scope, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Usage ${description} flow failed for resource ${resourceId}: ${message}`, error);
      if (error instanceof ExternalEffectFailureError || error instanceof FlowExecutionError) {
        throw error;
      }
    }
  }

  /** Stores the running time attributed to the session and returns how it was split with the sessions it shared the machine with. */
  private async persistAttributedOperatingDuration(
    usage: UsageSession,
    context: TransactionScope,
  ): Promise<OperatingShare | null> {
    const share = (await this.operatingAttributionService?.getShareForUsage(usage, context)) ?? null;
    const attributedOperatingDurationInMinutes = share ? share.shareMs / 60_000 : 0;
    await this.sessions.setAttributedOperatingDuration(usage.id, attributedOperatingDurationInMinutes, context);
    usage.attributedOperatingDurationInMinutes = attributedOperatingDurationInMinutes;
    return share;
  }

  /** Effective number of parallel sessions. Doors and unknown resources behave like a limit of 1. */
  getSessionLimit(context: TransactionScope | undefined, resourceId: number): Promise<number> {
    return this.sessions.findSessionLimit(resourceId, context);
  }

  /**
   * With a limit of 1 any lifecycle in progress blocks the resource, as before. With several parallel
   * sessions only a takeover reservation (exclusive) blocks; capacity and one-session-per-person are
   * enforced by the caller, and the same session cannot be ended twice (unique attempt index).
   */
  async assertLifecycleAvailable(
    context: TransactionScope | undefined,
    resourceId: number,
    sharedMachine = false,
  ): Promise<void> {
    if (await this.sessions.isLifecycleBlocked(resourceId, sharedMachine, context)) {
      throw new ConflictException('A usage lifecycle operation is already in progress for this resource');
    }
  }

  async getLifecycleAttempt(context: TransactionScope, id: string, resourceId: number): Promise<UsageLifecycleAttempt> {
    const attempt = await this.sessions.findAttempt(id, resourceId, context);
    if (!attempt) throw new SessionChangeInterruptedError();
    return attempt;
  }

  /**
   * Billing flow effects belong to the attempt until the entire lifecycle succeeds. Parallel flow branches stage items
   * at the same time; the attempt row stays locked from the read to the write, so each one appends to the items the
   * previous one committed.
   */
  async stageLifecycleBillingItem(
    attemptId: string,
    resourceId: number,
    usageId: number | undefined,
    item: Omit<UsageBillingItemDraft, 'usageId'>,
  ): Promise<void> {
    await this.transaction(async (scope) => {
      const attempt = await this.getLifecycleAttempt(scope, attemptId, resourceId);
      const targetUsageId = attempt.previousUsageId ?? attempt.candidateUsageId;
      if (targetUsageId === null || (usageId !== undefined && usageId !== targetUsageId)) {
        throw new ConflictException('Billing item does not belong to this usage lifecycle attempt');
      }
      await this.sessions.setBillingItems(
        attempt.id,
        [...attempt.billingItems, { ...item, usageId: targetUsageId }],
        scope,
      );
    });
  }
}
