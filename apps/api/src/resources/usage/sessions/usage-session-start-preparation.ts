import {
  FormSubmission,
  ResourceFormAction,
  ResourceType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
  ResourceMeter,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/database-entities';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { IsNull } from 'typeorm';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';

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

import { ActiveSessionCounts, RESOURCE_USAGE_LOG_CONTEXT, UsageLifecycle } from '../lifecycle/usage-lifecycle';

import { activeUsageWhere, countOccupiedSlots } from './active-usage';

import { UsageSessionRecords } from './usage-session-records';

export type PreparedSessionStart = Awaited<ReturnType<UsageSessionStartPreparation['prepareSessionStart']>>;

/** The checks and the tentative session of a start or takeover, and the read-only precheck that mirrors them. */
@Injectable()
export class UsageSessionStartPreparation {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly gate: UsageResourceGate,
    private readonly access: UsageAccessCache,
    private readonly records: UsageSessionRecords,
    private readonly billingService: BillingService,
    private readonly projectsService: ProjectsService,
    private readonly resourceFormsService: ResourceFormsService,
  ) {}

  async prepareSessionStart(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
  ) {
    return runSerializedTransaction(this.lifecycle.manager, async (transactionalEntityManager) => {
      const sessionLimit = await this.lifecycle.getSessionLimit(transactionalEntityManager, resourceId);
      const sharedMachine = sessionLimit > 1;
      await this.lifecycle.assertLifecycleAvailable(transactionalEntityManager, resourceId, sharedMachine);
      // Maintenance/health are enforced here; the control gate is applied below so the supervised
      // path can bypass the introduction requirement when a qualified supervisor is present.
      const resource = await this.gate.getResource(
        resourceId,
        user,
        {
          checkMaintenance: true,
          checkControlPermission: false,
        },
        transactionalEntityManager,
      );

      // Gate: the solo path stays identical to today's behavior. Only when the user cannot start
      // solo (or the resource mandates supervision) does the supervised path apply.
      if (supervisorUserId === null) {
        const userCanControl = await this.access.canControllResource(resourceId, user, transactionalEntityManager);
        if (!userCanControl) {
          this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
          throw new BadRequestException('You must complete the resource introduction before using it');
        }
        if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
          throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
        }
      } else {
        await this.gate.validateSupervisedStart(
          resourceId,
          user,
          supervisorUserId,
          transactionalEntityManager,
          resource,
        );
      }

      if (resource.type !== ResourceType.Machine) {
        throw new BadRequestException('Resource is not a machine');
      }

      let existingActiveSession: ResourceUsage | null = null;
      let publishedSessions: number;
      if (sharedMachine) {
        publishedSessions = await transactionalEntityManager.count(ResourceUsage, {
          where: { resourceId, ...activeUsageWhere() },
        });
        // Capacity is decided inside this serialized transaction: published sessions and other
        // people's pending starts occupy a slot, so simultaneous starts can never exceed the limit.
        const ownSession = await transactionalEntityManager.findOne(ResourceUsage, {
          where: { resourceId, userId: user.id, usageAction: ResourceUsageAction.Usage, endTime: IsNull() },
        });
        // A pending own session within this turn is a start cut off by a crash that is not cleaned up yet.
        if (ownSession) throw ownSession.lifecyclePending ? new MachineBusyError() : new AlreadyHasActiveSessionError();
        const occupied = await countOccupiedSlots(transactionalEntityManager, resourceId);
        if (occupied >= sessionLimit) throw new ResourceFullError(occupied, sessionLimit);
      } else {
        const activeSessions = await this.records.getActiveSessionsForResource(resourceId, transactionalEntityManager);
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

      const usageData: Partial<ResourceUsage> = {
        resourceId,
        usageAction: ResourceUsageAction.Usage,
        userId: user.id,
        startTime: new Date(),
        startNotes: dto.notes,
        endTime: null,
        endNotes: null,
        isFinalized: false,
        lifecyclePending: true,
      };

      const billingConfiguration = await this.billingService.getResourceBillingConfiguration(
        resourceId,
        transactionalEntityManager,
      );
      usageData.sessionDurationCreditsPerMinute = billingConfiguration.creditsPerMinute;
      usageData.operatingDurationCreditsPerMinute = billingConfiguration.creditsPerOperatingMinute;
      usageData.creditsPerUsage = billingConfiguration.creditsPerUsage;
      usageData.meterRates = this.lifecycle.metered
        ? (await transactionalEntityManager.find(ResourceMeter, { where: { resourceId } })).map((meter) => ({
            meterId: meter.id,
            name: meter.name,
            creditsPerUnit: meter.creditsPerUnit,
            allocation: meter.allocation,
          }))
        : [];

      if (supervisorUserId !== null) {
        usageData.supervisorUserId = supervisorUserId;
      }

      if (dto.projectId !== undefined) {
        const project = await this.projectsService.findOneById(user.id, dto.projectId);

        usageData.projectId = project.id;
      }

      this.logger.debug(`Creating new usage session for resource ${resourceId}`, { usageData });

      await transactionalEntityManager.createQueryBuilder().insert().into(ResourceUsage).values(usageData).execute();

      const createdSession = await transactionalEntityManager.findOne(ResourceUsage, {
        where: {
          resourceId,
          userId: user.id,
          endTime: IsNull(),
          lifecyclePending: true,
        },
        order: {
          startTime: 'DESC',
        },
        relations: ['resource', 'user', 'project'],
      });

      if (!createdSession) {
        this.logger.error(`Failed to retrieve newly created session for resource ${resourceId} and user ${user.id}`);
        throw new Error('Failed to retrieve the newly created session.');
      }

      // Use the user read inside this transaction, not the potentially stale authentication object.
      createdSession.billingFactor = createdSession.user.billingFactor;
      await transactionalEntityManager.update(ResourceUsage, createdSession.id, {
        billingFactor: createdSession.billingFactor,
      });

      this.logger.debug(
        `Successfully created session ${createdSession.id} for resource ${resourceId} by user ${user.id}`,
      );

      let formSubmissions: FormSubmission[] = [];
      if (resource.type === ResourceType.Machine) {
        const action = dto.forceTakeOver && !sharedMachine ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
        formSubmissions = await this.resourceFormsService.prepareRequiredSubmissions({
          resourceId,
          action,
          submissions: dto.formSubmissions,
          userId: user.id,
          resourceUsageId: createdSession.id,
          manager: transactionalEntityManager,
        });
      }

      await this.billingService.validateResourceUsageStart(
        resourceId,
        createdSession,
        user,
        transactionalEntityManager,
      );
      const attempt = await transactionalEntityManager.save(ResourceUsageLifecycleAttempt, {
        id: attemptId,
        resourceId,
        kind: existingActiveSession ? 'takeover' : 'start',
        candidateUsageId: createdSession.id,
        previousUsageId: existingActiveSession?.id ?? null,
        transitionTime: createdSession.startTime,
        formSubmissions,
        billingItems: [],
      });
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
    });
  }

  /**
   * Read-only can-start precheck (ATT-1187): raises the refusals `prepareSessionStart` would raise, except
   * balance, flows and form handling. Plugin pre-start hooks only run for users who pass it.
   */
  async precheckStart(
    resourceId: number,
    user: User,
    dto: { forceTakeOver?: boolean },
    supervisorUserId: number | null = null,
  ): Promise<void> {
    await this.lifecycle.assertLifecycleAvailable(this.lifecycle.manager, resourceId);
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
    const active = await this.records.getActiveSession(resourceId);
    if (!active) return;
    if (!dto.forceTakeOver) throw new ResourceInUseError();
    if (!resource.allowTakeOver) throw new BadRequestException('This resource does not allow overtaking');
  }
}
