import {
  FormSubmission,
  ResourceFlowNodeType,
  ResourceFormAction,
  ResourceType,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
  ResourceMeter,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/database-entities';

import { AuthenticatedUser, SystemEvent } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { IsNull } from 'typeorm';

import { runSerializedTransaction } from '../../../database/run-serialized-transaction';

import { FinalCollection } from '../../metering/resource-metering.service';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { EndSessionOptions, StartSessionOptions } from '../lifecycle/usage-lifecycle';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import {
  ResourceSupervisedUsageStartedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../events/resource-usage.events';

import { type ResourceUsageService } from '../resourceUsage.service';

import { ResourceInUseError } from '../errors/resource-in-use.error';

import { UsageAuthorization } from '../authorization/usage-authorization';

export abstract class UsageSessions extends UsageAuthorization {
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

  protected async notifySessionStarted(
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
  ): Promise<void> {
    if (prepared.existingActiveSession) {
      this.eventEmitter.emit(
        ResourceUsageSessionTakenOverEvent.EVENT_NAME,
        new ResourceUsageSessionTakenOverEvent(
          prepared.resource,
          prepared.attempt.transitionTime,
          user,
          prepared.existingActiveSession.user,
        ),
      );
    }

    if (endedUsageIdToEmit && takeoverEndedUser) {
      await this.audit
        .recordResource({
          action: 'usage_session.ended',
          ...auditOrigin,
          subjectId: resourceId,
          details: { usageId: endedUsageIdToEmit, usageUserId: takeoverEndedUser.id },
        })
        .catch(() => undefined);
    }
    if (newSession) {
      await this.audit
        .recordResource({
          action: 'usage_session.started',
          ...auditOrigin,
          subjectId: resourceId,
          details: {
            usageId: newSession.id,
            usageUserId: newSession.userId,
            ...(supervisorUserId === null ? {} : { supervisorUserId }),
          },
        })
        .catch(() => undefined);
    }

    // Emit events after the transaction committed to ensure readers can observe DB state
    try {
      if (endedUsageIdToEmit) {
        await this.emitUsageEvent(endedUsageIdToEmit);
      }
      if (newSession?.id) {
        await this.emitUsageEvent(newSession.id);
      } else if (startedUsageIdToEmit) {
        await this.emitUsageEvent(startedUsageIdToEmit);
      }
    } catch (error) {
      this.logger.error(`Failed to emit usage events after startSession commit`, (error as Error).stack);
    }

    if (takeoverEndedUser) {
      this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, newSession?.resource, takeoverEndedUser);
    }
    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_STARTED, newSession?.resource, newSession?.user);

    // Counter signal for the supervised-usage auto-promotion follow-up (ATT-486): every supervised
    // session start is counted there to decide when to auto-create an introduction for the user.
    if (supervisorUserId !== null && newSession?.id) {
      this.eventEmitter.emit(
        ResourceSupervisedUsageStartedEvent.EVENT_NAME,
        new ResourceSupervisedUsageStartedEvent(resourceId, user.id, supervisorUserId, newSession.id),
      );
    }

    this.metricsService.resourceUsageSessionsTotal.inc({ action: 'start' });
    this.metricsService.resourceUsageSessionsActive.inc();

    if (dto.notes?.trim()) {
      this.eventEmitter.emit(
        ResourceUsageNoteAddedEvent.EVENT_NAME,
        new ResourceUsageNoteAddedEvent(resourceId, dto.notes.trim(), 'start', {
          id: user.id,
          username: user.username,
        }),
      );
    }
  }

  async startSession(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<ResourceUsage> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto, options });

    const supervisorUserId = options.supervisorUserId ?? null;
    const auditOrigin = options.auditOrigin ?? { actorId: user.id, authenticationMethod: 'session' as const };

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let endedUsageIdToEmit: number | null = null;
    let startedUsageIdToEmit: number | null = null;
    let takeoverEndedUser: User | null = null;

    const attemptId = randomUUID();
    let chargeTransactionId: number | undefined;
    const prepared = await this.prepareSessionStart(resourceId, user, dto, supervisorUserId, attemptId);
    takeoverEndedUser = prepared.existingActiveSession?.user ?? null;

    let newSession: ResourceUsage;
    try {
      const { createdSession, existingActiveSession, formSubmissions, attempt } = prepared;
      // The outgoing session's total must be read before the meter is re-initialized for the next one.
      const outgoingFinal: FinalCollection = existingActiveSession
        ? ((await this.metering?.collectFinal(existingActiveSession.id, attempt.transitionTime)) ?? {
            status: 'not-metered',
          })
        : { status: 'not-metered' };
      // A billed session must not start unless its meter acknowledged the start; nothing is energized yet.
      await this.metering?.initialize({
        resourceId,
        usageId: createdSession.id,
        supersedes: existingActiveSession?.id,
      });
      await this.runUsageFlow(
        undefined,
        resourceId,
        existingActiveSession
          ? ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER
          : ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        existingActiveSession
          ? {
              ...this.getResourceUsageFlowPayload(existingActiveSession, formSubmissions),
              takeOverTime: attempt.transitionTime,
              newUser: user,
              oldUser: existingActiveSession.user,
            }
          : this.getResourceUsageFlowPayload(createdSession, formSubmissions),
        existingActiveSession ? 'takeover' : 'start',
        attemptId,
      );
      newSession = await runSerializedTransaction(this.resourceUsageRepository.manager, async (manager) => {
        const currentAttempt = await this.getLifecycleAttempt(manager, attemptId, resourceId);
        if (currentAttempt.candidateUsageId !== createdSession.id) {
          throw new ConflictException('The tentative usage session was cancelled');
        }
        // The flow may have independently triggered maintenance while this start was pending.
        // Recheck the gate before making the candidate session visible.
        await this.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: false }, manager);
        if (existingActiveSession) {
          await this.applyLifecycleDrafts(manager, currentAttempt);
          const result = await manager.update(
            ResourceUsage,
            { id: existingActiveSession.id, endTime: IsNull() },
            {
              endTime: currentAttempt.transitionTime,
              endNotes: `Session ended due to takeover by user ${user.id}`,
            },
          );
          if (result.affected === 0) throw new ConflictException('Usage session changed during takeover');
          const endedSession = await manager.findOneOrFail(ResourceUsage, {
            where: { id: existingActiveSession.id },
            relations: ['user', 'resource'],
          });
          await this.persistAttributedOperatingDuration(endedSession, manager);
          await this.metering?.settleInTransaction(manager, endedSession.id, outgoingFinal);
          chargeTransactionId = (await this.billingService.chargeForResourceUsage(endedSession, manager))?.id;
          endedUsageIdToEmit = endedSession.id;
        } else {
          startedUsageIdToEmit = createdSession.id;
        }
        // The outgoing charge must affect the final balance check, including same-user takeovers.
        // Both changes remain atomic if the replacement can no longer be afforded.
        await this.billingService.handleResourceUsageStart(resourceId, createdSession, user, manager);
        if (!existingActiveSession) await this.applyLifecycleDrafts(manager, currentAttempt);
        await manager.update(ResourceUsage, createdSession.id, { isFinalized: true, lifecyclePending: false });
        await manager.delete(ResourceUsageLifecycleAttempt, { id: attemptId, resourceId });
        return manager.findOneOrFail(ResourceUsage, {
          where: { id: createdSession.id },
          relations: ['resource', 'user', 'project'],
        });
      });
    } catch (error) {
      await this.abortLifecycleAttempt(attemptId, resourceId);
      throw error;
    }
    if (chargeTransactionId !== undefined) await this.billingService.notifyResourceUsageCharge(chargeTransactionId);
    this.flowExecutorService.trackResourceActivity(resourceId);
    await this.notifySessionStarted(
      resourceId,
      user,
      dto,
      supervisorUserId,
      auditOrigin,
      prepared,
      newSession,
      endedUsageIdToEmit,
      startedUsageIdToEmit,
      takeoverEndedUser,
    );

    return newSession;
  }

  protected async prepareSessionStart(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
  ) {
    return runSerializedTransaction(this.resourceUsageRepository.manager, async (transactionalEntityManager) => {
      await this.assertLifecycleAvailable(transactionalEntityManager, resourceId);
      // Maintenance/health are enforced here; the control gate is applied below so the supervised
      // path can bypass the introduction requirement when a qualified supervisor is present.
      const resource = await this.getResource(
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
        const userCanControl = await this.canControllResource(resourceId, user, transactionalEntityManager);
        if (!userCanControl) {
          this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
          throw new BadRequestException('You must complete the resource introduction before using it');
        }
        if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
          throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
        }
      } else {
        await this.validateSupervisedStart(resourceId, user, supervisorUserId, transactionalEntityManager, resource);
      }

      if (resource.type !== ResourceType.Machine) {
        throw new BadRequestException('Resource is not a machine');
      }

      const existingActiveSession = await this.getActiveSession(resourceId, transactionalEntityManager);
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
      usageData.meterRates = this.metering
        ? (await transactionalEntityManager.find(ResourceMeter, { where: { resourceId } })).map((meter) => ({
            meterId: meter.id,
            name: meter.name,
            creditsPerUnit: meter.creditsPerUnit,
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
        const action = dto.forceTakeOver ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
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
      return { resource, createdSession, existingActiveSession, attempt, formSubmissions };
    });
  }
}
