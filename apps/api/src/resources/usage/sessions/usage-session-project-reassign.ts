import { ResourceFlowNodeType, ResourceFormAction } from '@attraccess/application-models';
import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';
import { ProjectsService } from '../../../projects/projects.service';
import { ResourceFormsService } from '../../forms/forms.service';
import type { SwitchUsageSessionProjectDto } from '../dtos/switchUsageSessionProject.dto';
import { MachineBusyError } from '../errors/machine-busy.error';
import { SessionChangeInterruptedError } from '../errors/session-change-interrupted.error';
import { UsageLifecycle } from '../lifecycle/usage-lifecycle';
import { usageFlowPayload } from '../lifecycle/usage-flow-payload';
import { findTargetProject, pickChangeableSession } from './project-change-target';
import { UsageSessionEnds } from './usage-session-ends';
import { UsageSessionNotifications } from './usage-session-notifications';
import type { SwitchProjectOptions } from './usage-session-project-switch';
import { UsageSessionRecords } from './usage-session-records';

/**
 * Moves a whole running session to another project: the usage record keeps running and only its project changes, so
 * everything used in it so far counts for the new project. Nothing is metered, billed, ended or started. It is still a
 * session change (one attempt, one turn on the machine, all or nothing), because the project-reassign flows and forms
 * take part and may refuse it.
 */
@Injectable()
export class UsageSessionProjectReassign {
  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly ends: UsageSessionEnds,
    private readonly records: UsageSessionRecords,
    private readonly projectsService: ProjectsService,
    private readonly resourceFormsService: ResourceFormsService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly notifications: UsageSessionNotifications,
  ) {}

  async reassignProject(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    options: SwitchProjectOptions = {},
  ): Promise<UsageSession> {
    const attemptId = randomUUID();
    return this.ends.runSessionChange(resourceId, attemptId, () =>
      this.reassignNow(resourceId, user, dto, options, attemptId),
    );
  }

  private async reassignNow(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    options: SwitchProjectOptions,
    attemptId: string,
  ): Promise<UsageSession> {
    const auditOrigin = options.auditOrigin ?? ({ id: user.id, authenticationMethod: 'session' } satisfies AuditActor);
    const project = await findTargetProject(this.projectsService, user, dto.projectId);
    const projectId = project?.id ?? null;
    const { session, changeTime, formSubmissions, activeSessions } = await this.prepare(
      resourceId,
      user,
      dto,
      projectId,
      attemptId,
    );

    let reassigned: UsageSession;
    try {
      await this.lifecycle.runUsageFlow(
        undefined,
        resourceId,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_REASSIGNED,
        {
          ...usageFlowPayload(session, formSubmissions),
          changeTime,
          usageId: session.id,
          previousProjectId: session.projectId,
          newProjectId: projectId,
          previousProject: session.project ?? null,
          newProject: project,
          activeSessions,
        },
        'project reassign',
        { lifecycleAttemptId: attemptId, actorUserId: auditOrigin.id ?? user.id },
      );
      reassigned = await this.lifecycle.transaction(async (scope) => {
        const attempt = await this.lifecycle.getLifecycleAttempt(scope, attemptId, resourceId);
        if (!(await this.lifecycle.sessions.assignRunningProject(session.id, projectId, scope))) {
          throw new SessionChangeInterruptedError();
        }
        // The submitted forms and the billing items the flows added go on the running record, like everything else.
        await this.lifecycle.applyLifecycleDrafts(scope, attempt);
        await this.lifecycle.sessions.deleteAttempt(attemptId, resourceId, scope);
        await this.audit.record(
          {
            domain: 'resource',
            action: 'usage_session.project_reassigned',
            actor: auditOrigin,
            subject: { type: 'resource', id: resourceId },
            details: {
              usageId: session.id,
              usageUserId: session.userId as number,
              ...(session.projectId === null ? {} : { previousProjectId: session.projectId }),
              ...(projectId === null ? {} : { projectId }),
            },
          },
          scope,
        );
        return this.lifecycle.sessions.findSessionWithRelations(session.id, 'started', scope);
      });
    } catch (error) {
      await this.lifecycle.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    this.notifications.notifyProjectReassigned(session, reassigned, changeTime);
    return reassigned;
  }

  private prepare(
    resourceId: number,
    user: UsageSessionUser,
    dto: SwitchUsageSessionProjectDto,
    projectId: number | null,
    attemptId: string,
  ) {
    return this.lifecycle.transaction(async (scope) => {
      const sessionLimit = await this.lifecycle.getSessionLimit(scope, resourceId);
      const sharedMachine = sessionLimit > 1;
      await this.lifecycle.assertLifecycleAvailable(scope, resourceId, sharedMachine);
      const active = await this.records.getActiveSessionsForResource(resourceId, scope);
      const session = pickChangeableSession(active, user, dto.usageId, projectId);
      if (sharedMachine && (await this.lifecycle.sessions.isSessionBeingEnded(session.id, scope))) {
        throw new MachineBusyError();
      }

      const changeTime = new Date();
      const formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
        resourceId,
        action: ResourceFormAction.PROJECT_REASSIGN,
        submissions: dto.formSubmissions,
        userId: user.id,
        resourceUsageId: session.id,
        scope,
      });
      // The attempt reserves the running session: no stop, takeover or other change of it can start meanwhile.
      await this.lifecycle.sessions.saveAttempt(
        {
          id: attemptId,
          resourceId,
          kind: 'project-reassign',
          candidateUsageId: null,
          previousUsageId: session.id,
          transitionTime: changeTime,
          formSubmissions,
          billingItems: [],
        },
        scope,
      );
      return {
        session,
        changeTime,
        formSubmissions,
        activeSessions: { before: active.length, after: active.length, limit: sessionLimit },
      };
    });
  }
}
