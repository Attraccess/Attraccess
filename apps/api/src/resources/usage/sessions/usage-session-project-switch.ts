import {
  ProjectSwitchCharging,
  ResourceFlowNodeType,
  ResourceFormAction,
  ResourceType,
  ResourceUsageAction,
} from '@attraccess/application-models';
import type {
  UsageSession,
  UsageSessionUser,
  UsageSessionWithParties,
  UsageFormSubmissionDraft,
} from '@attraccess/application-models';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';
import { BillingService } from '../../../billing/charges/billing.service';
import type { TransactionScope } from '../../../database/unit-of-work';
import { ProjectsService } from '../../../projects/projects.service';
import { ResourceFormsService } from '../../forms/forms.service';
import type { FinalCollection } from '../../metering/resource-metering.service';
import type { SwitchUsageSessionProjectDto } from '../dtos/switchUsageSessionProject.dto';
import { MachineBusyError } from '../errors/machine-busy.error';
import { NoSessionToSwitchError } from '../errors/no-session-to-switch.error';
import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';
import { TentativeSessionCancelledError } from '../errors/tentative-session-cancelled.error';
import { ActiveSessionCounts, UsageLifecycle } from '../lifecycle/usage-lifecycle';
import { usageFlowPayload } from '../lifecycle/usage-flow-payload';
import { assertNewSessionPayableAfterCharge } from './switch-balance-precheck';
import { UsageSessionEnds } from './usage-session-ends';
import { UsageSessionNotifications } from './usage-session-notifications';
import { UsageSessionRecords } from './usage-session-records';

export interface SwitchProjectOptions {
  auditOrigin?: AuditActor;
}

/** A switch that is reserved: the continuation exists but is not visible yet. */
interface PreparedProjectSwitch {
  previous: UsageSession;
  continuation: UsageSessionWithParties;
  switchTime: Date;
  formSubmissions: UsageFormSubmissionDraft[];
  activeSessions: ActiveSessionCounts;
}

/**
 * Moves a running session to another project without stopping the machine: the current usage ends and a
 * continuation starts at the same instant. It is a session change like a takeover (one attempt, one turn on the
 * machine, all or nothing), but only the project-switch flows and forms take part in it.
 */
@Injectable()
export class UsageSessionProjectSwitch {
  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly ends: UsageSessionEnds,
    private readonly records: UsageSessionRecords,
    private readonly billingService: BillingService,
    private readonly projectsService: ProjectsService,
    private readonly resourceFormsService: ResourceFormsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async switchProject(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    options: SwitchProjectOptions = {},
  ): Promise<UsageSession> {
    const attemptId = randomUUID();
    return this.ends.runSessionChange(resourceId, attemptId, () =>
      this.switchNow(resourceId, user, dto, options, attemptId),
    );
  }

  /**
   * The refusals of a switch that can be told before anything is asked of the person, such as the switch forms. The
   * switch itself checks again.
   */
  async assertSwitchable(resourceId: number, user: UsageSessionUser, dto: SwitchUsageSessionProjectDto): Promise<void> {
    const projectId = await this.targetProjectId(user, dto);
    const active = await this.records.getActiveSessionsForResource(resourceId);
    this.pickSwitchableSession(active, user, dto.usageId, projectId);
  }

  private async targetProjectId(user: UsageSessionUser, dto: SwitchUsageSessionProjectDto): Promise<number | null> {
    if (dto.projectId === undefined) throw new BadRequestException('Project assignment is required');
    // The same membership check as at the start; resolved before the transaction, as it reads on its own connection.
    return dto.projectId === null ? null : (await this.projectsService.findOneById(user.id, dto.projectId)).id;
  }

  private async switchNow(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    options: SwitchProjectOptions,
    attemptId: string,
  ): Promise<UsageSession> {
    const auditOrigin = options.auditOrigin ?? ({ id: user.id, authenticationMethod: 'session' } satisfies AuditActor);
    const projectId = await this.targetProjectId(user, dto);
    const prepared = await this.prepare(resourceId, user, dto, projectId, attemptId);
    const { previous, continuation, switchTime, formSubmissions } = prepared;

    let switched: UsageSession;
    let chargeTransactionId: number | undefined;
    try {
      // The meter boundary comes first: a meter that cannot be read refuses the switch before any flow ran.
      const final: FinalCollection = await this.lifecycle.handOverMeters(previous.id, continuation.id, switchTime);
      if (continuation.projectSwitchCharging === ProjectSwitchCharging.NEW_SESSION) {
        await assertNewSessionPayableAfterCharge(this.lifecycle, this.billingService, {
          resourceId,
          previousUsageId: previous.id,
          continuation,
          switchTime,
          final,
          user,
        });
      }
      await this.lifecycle.runUsageFlow(
        undefined,
        resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED,
        {
          ...usageFlowPayload(previous, formSubmissions),
          switchTime,
          previousUsageId: previous.id,
          newUsageId: continuation.id,
          previousProjectId: previous.projectId,
          newProjectId: projectId,
          previousProject: previous.project ?? null,
          newProject: continuation.project ?? null,
          activeSessions: prepared.activeSessions,
        },
        'project switch',
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.id ?? user.id },
      );
      switched = await this.lifecycle.transaction(async (scope) => {
        const committed = await this.commit(scope, resourceId, user, prepared, attemptId, final);
        chargeTransactionId = committed.chargeTransactionId;
        await this.audit.record(
          {
            domain: 'resource',
            action: 'usage_session.project_switched',
            actor: auditOrigin,
            subject: { type: 'resource', id: resourceId },
            details: {
              usageId: previous.id,
              newUsageId: continuation.id,
              usageUserId: previous.userId as number,
              ...(previous.projectId === null ? {} : { previousProjectId: previous.projectId }),
              ...(projectId === null ? {} : { projectId }),
            },
          },
          scope,
        );
        return committed.session;
      });
    } catch (error) {
      await this.lifecycle.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    await this.notifications.notifyProjectSwitched(previous, switched, switchTime, chargeTransactionId);
    return switched;
  }

  /**
   * The running session the request means: the named one, or the caller's own. Only naming somebody else's session is
   * forbidden; without a name, other people's sessions are not the caller's concern, so having none is simply 404.
   */
  private pickOwnSession(sessions: UsageSession[], user: UsageSessionUser, usageId: number | undefined): UsageSession {
    const session = sessions.find((candidate) =>
      usageId === undefined ? candidate.userId === user.id : candidate.id === usageId,
    );
    if (!session) throw new NoSessionToSwitchError();
    if (session.userId !== user.id) {
      throw new ForbiddenException('Only the owner of a running session can switch its project');
    }
    return session;
  }

  private pickSwitchableSession(
    sessions: UsageSession[],
    user: UsageSessionUser,
    usageId: number | undefined,
    projectId: number | null,
  ): UsageSession {
    const session = this.pickOwnSession(sessions, user, usageId);
    if (session.usageAction !== ResourceUsageAction.Usage || session.resource?.type !== ResourceType.Machine) {
      throw new BadRequestException('Only running machine sessions can switch their project');
    }
    if (session.projectId === projectId) {
      throw new BadRequestException('The session already belongs to this project');
    }
    return session;
  }

  private prepare(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    projectId: number | null,
    attemptId: string,
  ): Promise<PreparedProjectSwitch> {
    const { sessions } = this.lifecycle;
    return this.lifecycle.transaction(async (scope) => {
      const sessionLimit = await this.lifecycle.getSessionLimit(scope, resourceId);
      const sharedMachine = sessionLimit > 1;
      await this.lifecycle.assertLifecycleAvailable(scope, resourceId, sharedMachine);
      const active = await this.records.getActiveSessionsForResource(resourceId, scope);
      const previous = this.pickSwitchableSession(active, user, dto.usageId, projectId);
      if (sharedMachine && (await sessions.isSessionBeingEnded(previous.id, scope))) {
        throw new MachineBusyError();
      }

      const switchTime = new Date();
      const { projectSwitchCharging } = await this.billingService.getResourceBillingConfiguration(resourceId, scope);
      const continuation = await sessions.createContinuationSession(
        { previousUsageId: previous.id, startTime: switchTime, projectId, projectSwitchCharging },
        scope,
      );
      const formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
        resourceId,
        action: ResourceFormAction.PROJECT_SWITCH,
        submissions: dto.formSubmissions,
        userId: user.id,
        resourceUsageId: continuation.id,
        scope,
      });
      if (projectSwitchCharging === ProjectSwitchCharging.NEW_SESSION) {
        // Refused before anything happens when the balance cannot pay for another session even now.
        await this.billingService.validateResourceUsageStart(resourceId, continuation, user, scope);
      }
      await sessions.saveAttempt(
        {
          id: attemptId,
          resourceId,
          kind: 'project-switch',
          candidateUsageId: continuation.id,
          previousUsageId: previous.id,
          transitionTime: switchTime,
          formSubmissions,
          billingItems: [],
        },
        scope,
      );
      return {
        previous,
        continuation,
        switchTime,
        formSubmissions,
        activeSessions: { before: active.length, after: active.length, limit: sessionLimit },
      };
    });
  }

  /** Ends and bills the old part and publishes the continuation, as one change. */
  private async commit(
    scope: TransactionScope,
    resourceId: number,
    user: UsageSessionUser,
    { previous, continuation, switchTime }: PreparedProjectSwitch,
    attemptId: string,
    final: FinalCollection,
  ) {
    const { sessions } = this.lifecycle;
    const attempt = await this.lifecycle.getLifecycleAttempt(scope, attemptId, resourceId);
    if (attempt.candidateUsageId !== continuation.id) throw new TentativeSessionCancelledError();
    await sessions.inheritDeadline(previous.id, continuation.id, scope);
    // Submitted forms belong to the continuation, billing items the flows added to the part that ends.
    await this.lifecycle.applyLifecycleDrafts(scope, attempt);
    // No end notes: the session goes on.
    const ended = await sessions.endSessionIfOpen(previous.id, { endTime: switchTime, endNotes: null }, scope);
    if (!ended) throw new ConflictException('Usage session changed during the project switch');
    const endedSession = await sessions.findSessionWithRelations(previous.id, 'ended', scope);
    const chargeTransactionId = await this.lifecycle.settleEndedSession(scope, endedSession, final);
    // After the old part's charge, which a charging mode with its own balance check has to see.
    await this.billingService.handleResourceUsageContinuation(resourceId, continuation, user, scope);
    if (!(await sessions.publishSession(continuation.id, scope))) throw new SessionChangeInterruptedError();
    await sessions.deleteAttempt(attemptId, resourceId, scope);
    return {
      chargeTransactionId,
      session: await sessions.findSessionWithRelations(continuation.id, 'started', scope),
    };
  }
}
