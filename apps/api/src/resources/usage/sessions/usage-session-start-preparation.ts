import { ResourceFormAction, ResourceType, SupervisionMode } from '@attraccess/application-models';
import type {
  UsageFormSubmissionDraft,
  UsageLifecycleAttempt,
  UsageSession,
  UsageSessionUser,
} from '@attraccess/application-models';

import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { TransactionScope } from '../../../database/unit-of-work';

import { SettingsService } from '../../../settings/settings.service';

import {
  ReaderUiHooksService,
  type StartCapacityOutcome,
} from '../../../plugin-system/reader-ui/reader-ui-hooks.service';

import { hookPrincipal } from '../pre-start/hook-principal';

import { StartBlockedException } from '../pre-start/start-confirmation.errors';

import { BillingService } from '../../../billing/charges/billing.service';

import { ProjectsService } from '../../../projects/projects.service';

import { ResourceFormsService } from '../../forms/forms.service';

import { UsageAccessCache } from '../authorization/usage-access-cache';

import { UsageResourceGate } from '../authorization/usage-resource-gate';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { ResourceInUseError } from '../errors/resource-in-use.error';

import { ResourceFullError } from '../errors/resource-full.error';

import { AlreadyHasActiveSessionError } from '../errors/already-has-active-session.error';
import { MachineBusyError } from '../errors/machine-busy.error';

import {
  ActiveSessionCounts,
  RESOURCE_USAGE_LOG_CONTEXT,
  StartSessionOptions,
  UsageLifecycle,
} from '../lifecycle/usage-lifecycle';

import { USAGE_SESSION_STORE, UsageSessionStore } from '../usage-session-store.port';

import { sessionLimitOf } from './active-usage';

import { UsageSessionRecords } from './usage-session-records';

export type PreparedSessionStart = Awaited<ReturnType<UsageSessionStartPreparation['prepareSessionStart']>>;

/** The checks and the tentative session of a start or takeover, and the read-only precheck that mirrors them. */
@Injectable()
export class UsageSessionStartPreparation {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly lifecycle: UsageLifecycle,
    @Inject(USAGE_SESSION_STORE) private readonly sessions: UsageSessionStore,
    private readonly gate: UsageResourceGate,
    private readonly access: UsageAccessCache,
    private readonly records: UsageSessionRecords,
    private readonly billingService: BillingService,
    private readonly projectsService: ProjectsService,
    private readonly resourceFormsService: ResourceFormsService,
    // Optional: without the plugin system (unit-test modules) no capacity hook exists.
    @Optional() private readonly pluginHooks?: ReaderUiHooksService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async prepareSessionStart(
    resourceId: number,
    user: UsageSessionUser,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
    options: StartSessionOptions = {},
  ) {
    // Runs after the transaction ended (commit or rollback): audit rows inside it would wait for the transaction.
    let flushCapacityAudit: (() => Promise<void>) | undefined;
    const capacityLanguage = this.pluginHooks?.hasStartCapacityHooks()
      ? (options.language ?? (await this.settings?.resolveLanguage(user.locale)) ?? 'en')
      : null;
    return this.lifecycle
      .transaction(async (scope) => {
        const sessionLimit = await this.lifecycle.getSessionLimit(scope, resourceId);
        const sharedMachine = sessionLimit > 1;
        await this.lifecycle.assertLifecycleAvailable(scope, resourceId, sharedMachine);
        // Maintenance/health are enforced here; the control gate is applied below so the supervised
        // path can bypass the introduction requirement when a qualified supervisor is present.
        const resource = await this.gate.getResource(
          resourceId,
          user,
          {
            checkMaintenance: true,
            checkControlPermission: false,
          },
          scope,
        );

        // Gate: the solo path stays identical to today's behavior. Only when the user cannot start
        // solo (or the resource mandates supervision) does the supervised path apply.
        if (supervisorUserId === null) {
          const userCanControl = await this.access.canControllResource(resourceId, user, scope);
          if (!userCanControl) {
            this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
            throw new BadRequestException('You must complete the resource introduction before using it');
          }
          if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
            throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
          }
        } else {
          await this.gate.validateSupervisedStart(resourceId, user, supervisorUserId, scope, resource);
        }

        if (resource.type !== ResourceType.Machine) {
          throw new BadRequestException('Resource is not a machine');
        }

        let existingActiveSession: UsageSession | null = null;
        let publishedSessions: number;
        if (sharedMachine) {
          publishedSessions = await this.sessions.countActiveSessions(resourceId, scope);
          // Capacity is decided inside this serialized transaction: published sessions and other
          // people's pending starts occupy a slot, so simultaneous starts can never exceed the limit.
          const ownSession = await this.sessions.findOwnOpenSession(resourceId, user.id, scope);
          // A pending own session within this turn is a start cut off by a crash that is not cleaned up yet.
          if (ownSession)
            throw ownSession.lifecyclePending ? new MachineBusyError() : new AlreadyHasActiveSessionError();
          const usersInSession = await this.sessions.findOccupyingUserIds(resourceId, scope);
          const occupied = usersInSession.length;
          if (occupied >= sessionLimit) throw new ResourceFullError(occupied, sessionLimit);
          // Slots plugins hold back (reservations) are decided here too, so simultaneous starts cannot take them.
          if (capacityLanguage) {
            const outcome = await this.runCapacityHooks(
              { resourceId, user, options, supervisorUserId },
              { language: capacityLanguage, sessionLimit, usersInSession, scope },
            );
            flushCapacityAudit = outcome?.flush;
            if (outcome?.refusal) throw new StartBlockedException(outcome.refusal.reason);
          }
        } else {
          const activeSessions = await this.records.getActiveSessionsForResource(resourceId, scope);
          publishedSessions = activeSessions.length;
          // A limit lowered to 1 can leave several sessions running; takeover needs exactly one to replace.
          existingActiveSession = activeSessions.length === 1 ? activeSessions[0] : null;
          if (activeSessions.length > 1) throw new ResourceInUseError();
        }
        if (existingActiveSession) {
          this.logger.debug(
            `Found existing active session for resource ${resourceId} by user ${existingActiveSession.user.id}`,
          );

          // If there's an active session, check if takeover is allowed
          if (dto.forceTakeOver && resource.allowTakeOver) {
            this.logger.debug(
              `Forcing takeover of resource ${resourceId} from user ${existingActiveSession.user.id} to user ${user.id}`,
            );

            // The outgoing user is retained after this transaction succeeds.
          } else if (dto.forceTakeOver && !resource.allowTakeOver) {
            this.logger.warn(`Takeover attempted for resource ${resourceId} but not allowed`);
            throw new BadRequestException('This resource does not allow overtaking');
          } else {
            this.logger.warn(`Resource ${resourceId} is currently in use by user ${existingActiveSession.user.id}`);
            throw new ResourceInUseError();
          }
        }

        const startTime = new Date();
        const billingConfiguration = await this.billingService.getResourceBillingConfiguration(resourceId, scope);
        const meterRates = this.lifecycle.metered ? await this.sessions.findMeterRates(resourceId, scope) : [];
        const projectId =
          dto.projectId === undefined ? undefined : (await this.projectsService.findOneById(user.id, dto.projectId)).id;

        this.logger.debug(`Creating new usage session for resource ${resourceId}`, { resourceId, userId: user.id });

        const createdSession = await this.sessions.createPendingSession(
          {
            resourceId,
            userId: user.id,
            startTime,
            startNotes: dto.notes,
            sessionDurationCreditsPerMinute: billingConfiguration.creditsPerMinute,
            operatingDurationCreditsPerMinute: billingConfiguration.creditsPerOperatingMinute,
            creditsPerUsage: billingConfiguration.creditsPerUsage,
            meterRates,
            ...(supervisorUserId === null ? {} : { supervisorUserId }),
            ...(projectId === undefined ? {} : { projectId }),
          },
          scope,
        );

        this.logger.debug(
          `Successfully created session ${createdSession.id} for resource ${resourceId} by user ${user.id}`,
        );

        let formSubmissions: UsageFormSubmissionDraft[] = [];
        if (resource.type === ResourceType.Machine) {
          const action = dto.forceTakeOver && !sharedMachine ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
          formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
            resourceId,
            action,
            submissions: dto.formSubmissions,
            userId: user.id,
            resourceUsageId: createdSession.id,
            scope,
          });
        }

        await this.billingService.validateResourceUsageStart(resourceId, createdSession, user, scope);
        const attempt: UsageLifecycleAttempt = await this.sessions.saveAttempt(
          {
            id: attemptId,
            resourceId,
            kind: existingActiveSession ? 'takeover' : 'start',
            candidateUsageId: createdSession.id,
            previousUsageId: existingActiveSession?.id ?? null,
            transitionTime: createdSession.startTime,
            formSubmissions,
            billingItems: [],
          },
          scope,
        );
        const activeSessionCounts: ActiveSessionCounts = {
          before: publishedSessions,
          after: existingActiveSession ? publishedSessions : publishedSessions + 1,
          limit: sessionLimit,
        };
        return {
          resource,
          createdSession,
          existingActiveSession,
          attempt,
          formSubmissions,
          activeSessions: activeSessionCounts,
        };
      })
      .finally(() => flushCapacityAudit?.());
  }

  /**
   * Asks the plugins' capacity hooks how many slots they hold back for others; the caller refuses the start on a
   * refusal. The outcome's `flush` writes the audit rows and must run after the transaction ended.
   */
  private runCapacityHooks(
    start: {
      resourceId: number;
      user: UsageSessionUser;
      options: StartSessionOptions;
      supervisorUserId: number | null;
    },
    state: { language: 'en' | 'de'; sessionLimit: number; usersInSession: number[]; scope: TransactionScope },
  ): Promise<StartCapacityOutcome> | undefined {
    const { resourceId, user, options, supervisorUserId } = start;
    return this.pluginHooks?.runStartCapacity({
      resourceId,
      userId: user.id,
      principal: hookPrincipal(user),
      // A shared machine has no takeover: a forceTakeOver there adds a session like any other start.
      action: 'start',
      origin: options.origin ?? (supervisorUserId === null ? 'web' : 'supervision'),
      language: state.language,
      sessionLimit: state.sessionLimit,
      occupiedSlots: state.usersInSession.length,
      usersInSession: state.usersInSession,
      scope: state.scope,
      satisfied: new Map(
        Object.entries(options.confirmedStepKeys ?? {}).map(([plugin, keys]) => [plugin, new Set(keys)]),
      ),
    });
  }

  /**
   * Read-only can-start precheck (ATT-1187): raises the refusals `prepareSessionStart` would raise, except
   * balance, flows and form handling. Plugin pre-start hooks only run for users who pass it.
   */
  async precheckStart(
    resourceId: number,
    user: UsageSessionUser,
    dto: { forceTakeOver?: boolean },
    supervisorUserId: number | null = null,
  ): Promise<void> {
    // A shared machine lets other people's starts run alongside, as in the start itself.
    const limit = await this.lifecycle.getSessionLimit(undefined, resourceId);
    await this.lifecycle.assertLifecycleAvailable(undefined, resourceId, limit > 1);
    const resource = await this.gate.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: false,
    });
    if (supervisorUserId === null) {
      if (!(await this.access.canControllResource(resourceId, user))) {
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
      if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
        throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
      }
    } else {
      await this.gate.validateSupervisedStart(resourceId, user, supervisorUserId, undefined, resource);
    }
    if (resource.type !== ResourceType.Machine) throw new BadRequestException('Resource is not a machine');
    const sessionLimit = sessionLimitOf(resource);
    if (sessionLimit > 1) {
      // Several sessions may run: only the caller's own session and a full machine refuse (as in the start).
      const sessions = await this.records.getActiveSessionsForResource(resourceId);
      if (sessions.some((session) => session.userId === user.id)) throw new AlreadyHasActiveSessionError();
      const occupied = await this.sessions.countOccupiedSlots(resourceId);
      if (occupied >= sessionLimit) throw new ResourceFullError(occupied, sessionLimit);
      return;
    }
    const active = await this.records.getActiveSession(resourceId);
    if (!active) return;
    if (!dto.forceTakeOver) throw new ResourceInUseError();
    if (!resource.allowTakeOver) throw new BadRequestException('This resource does not allow overtaking');
  }
}
