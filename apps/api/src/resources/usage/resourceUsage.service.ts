import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, FindOneOptions, EntityManager } from 'typeorm';
import {
  FormSubmission,
  Resource,
  ResourceFlowNodeType,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  SupervisionMode,
  User,
} from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { UpdateUsageSessionProjectDto } from './dtos/updateUsageSessionProject.dto';
import { ResourceNotFoundException } from '../../exceptions/resource.notFound.exception';
import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../exceptions/resource.maintenance.inUse.exception';
import { ResourceUnhealthyException } from '../../exceptions/resource.unhealthy.exception';
import { ResourceHealthService } from '../health/resource-health.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionTakenOverEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceSupervisedUsageStartedEvent,
  ResourceSupervisedUsageEndedEvent,
} from './events/resource-usage.events';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { BillingService } from '../../billing/billing.service';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../forms/forms.service';
import { ResourceFormAction } from '@attraccess/database-entities';
import { MetricsService } from '../../metrics/metrics.service';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { PluginEventsService } from '../../plugin-system/plugin-events.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';

export interface EndSessionOptions {
  /** Skip persisting required END-action form submissions (used by automated/flow paths). */
  skipFormSubmissions?: boolean;
  /** Skip emitting ResourceUsageNoteAddedEvent (used when the note is auto-generated, e.g. flow-ended). */
  skipNoteNotification?: boolean;
}

export interface StartSessionOptions {
  /**
   * When set, the session is started as a supervised session attributed to this supervisor.
   * The supervisor is validated against the resource (introducer/maintainer or canManageResources).
   */
  supervisorUserId?: number;
}

@Injectable()
export class ResourceUsageService {
  private readonly logger = new Logger(ResourceUsageService.name);
  private sqliteEndSessionChain: Promise<unknown> = Promise.resolve();

  private isSqliteDriver(manager: EntityManager | undefined = this.resourceUsageRepository.manager): boolean {
    const type = manager?.connection?.options?.type;
    if (!type) {
      return false;
    }
    return type === 'sqlite' || type === 'better-sqlite3' || type === 'sqljs';
  }

  private async runSerializedIfSqlite<T>(manager: EntityManager | undefined, task: () => Promise<T>): Promise<T> {
    if (!this.isSqliteDriver(manager)) {
      return task();
    }

    // Queue tasks sequentially to avoid nested transactions on sqlite's single connection
    const next = this.sqliteEndSessionChain.then(task);
    this.sqliteEndSessionChain = next.catch((error) => {
      this.logger.warn('Serial endSession chain failed; continuing queue', error);
    });
    return next;
  }

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly resourceIntroductionService: ResourceIntroductionsService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
    private readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService,
    private readonly resourceGroupsService: ResourceGroupsService,
    private readonly resourceRetrainingService: ResourceRetrainingService,
    private readonly resourceMaintenanceService: ResourceMaintenanceService,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    @Inject(forwardRef(() => ResourceFlowsExecutorService))
    private readonly flowExecutorService: ResourceFlowsExecutorService,
    private readonly projectsService: ProjectsService,
    private readonly resourceFormsService: ResourceFormsService,
    private readonly metricsService: MetricsService,
    private readonly resourceHealthService: ResourceHealthService,
    private readonly pluginEvents: PluginEventsService,
    private readonly rbacService: RbacService,
  ) {}

  private emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: Resource | undefined,
    user: User | undefined,
  ): void {
    if (!resource || !user) {
      return;
    }
    try {
      this.pluginEvents.emit(event, { resource, user });
    } catch (error) {
      this.logger.error(`Failed to emit plugin SystemEvent ${event}`, (error as Error).stack);
    }
  }

  public async canControllResource(
    resourceId: number,
    user: User,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const effectivePermissions = await this.rbacService.getEffectivePermissions(user.id);
    if (effectivePermissions.has('resources.update')) {
      return true;
    }

    if (await this.resourceIntroductionService.hasValidIntroduction(resourceId, user.id, transactionalEntityManager)) {
      if (!(await this.resourceRetrainingService.isResourceIntroductionBlocked(resourceId, user.id))) {
        this.logger.debug(`User ${user.id} has valid introduction for resource ${resourceId}`);
        return true;
      }
      this.logger.debug(`User ${user.id} introduction for resource ${resourceId} is blocked pending retraining`);
    }

    if (await this.resourceIntroducersService.canMaintain(resourceId, user.id, true, transactionalEntityManager)) {
      this.logger.debug(`User ${user.id} is an introducer or maintainer for resource ${resourceId}`);
      return true;
    }

    const groupsOfResource = await this.resourceGroupsService.getGroupsOfResource(
      resourceId,
      transactionalEntityManager,
    );
    for (const group of groupsOfResource) {
      if (
        await this.resourceGroupsIntroductionsService.hasValidIntroduction(
          { groupId: group.id, userId: user.id },
          transactionalEntityManager,
        )
      ) {
        if (!(await this.resourceRetrainingService.isGroupIntroductionBlocked(group.id, user.id))) {
          this.logger.debug(`User ${user.id} has valid group introduction for resource ${resourceId}`);
          return true;
        }
        this.logger.debug(
          `User ${user.id} group introduction (${group.id}) for resource ${resourceId} is blocked pending retraining`,
        );
      }
    }

    this.logger.debug(`User ${user.id} cannot control resource ${resourceId}`);
    return false;
  }

  /**
   * Validates that a supervised start is permissible for the given resource and supervisor.
   *
   * Throws when:
   * - the resource does not allow supervision (supervisionMode is INTRODUCTION_REQUIRED),
   * - the requester selected themselves as supervisor,
   * - the supervisor does not exist,
   * - the supervisor is neither an introducer/maintainer for the resource nor a global resource manager.
   *
   * Does NOT check the requester's own introduction status: a supervised start exists precisely to
   * let a non-introduced user start under a qualified supervisor.
   */
  public async validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<void> {
    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = preloadedResource ?? (await resourceRepository.findOne({ where: { id: resourceId } }));
    if (!resource) {
      throw new ResourceNotFoundException(resourceId);
    }

    if (
      resource.supervisionMode !== SupervisionMode.SUPERVISION_ALLOWED &&
      resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED
    ) {
      throw new BadRequestException('This resource does not support supervised sessions');
    }

    if (supervisorUserId === requester.id) {
      throw new BadRequestException('You cannot supervise your own session');
    }

    const userRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(User)
      : this.userRepository;

    const supervisor = await userRepository.findOne({ where: { id: supervisorUserId } });
    if (!supervisor) {
      throw new NotFoundException(`Supervisor with ID ${supervisorUserId} not found`);
    }

    const supervisorPermissions = await this.rbacService.getEffectivePermissions(supervisor.id);
    const supervisorCanManage = supervisorPermissions.has('resources.update');
    const supervisorCanMaintain = await this.resourceIntroducersService.canMaintain(
      resourceId,
      supervisorUserId,
      true,
      transactionalEntityManager,
    );

    if (!supervisorCanManage && !supervisorCanMaintain) {
      throw new ForbiddenException('The selected supervisor is not authorized to supervise this resource');
    }
  }

  private async getResource(
    resourceId: number,
    user: User,
    opts: { checkMaintenance: boolean; checkControlPermission: boolean },
    transactionalEntityManager?: EntityManager,
  ): Promise<Resource> {
    const { checkMaintenance, checkControlPermission } = opts;

    const resourceRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(Resource)
      : this.resourceRepository;

    const resource = await resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      this.logger.warn(`Resource ${resourceId} not found`);
      throw new ResourceNotFoundException(resourceId);
    }
    this.logger.debug(`Found resource ${resourceId}: ${resource.name}`);

    if (checkMaintenance) {
      // Single enforcement point for maintenance mode: only users who can manage maintenance
      // may start a session (or lock/unlock door, etc.). Applies to both manual and
      // schedule-triggered maintenances (see hasActiveMaintenance).
      const hasActiveMaintenance = await this.resourceMaintenanceService.hasActiveMaintenance(
        resourceId,
        transactionalEntityManager,
      );
      if (hasActiveMaintenance) {
        // Check if user can manage maintenance (which allows them to use during maintenance)
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );

        if (!canManageMaintenance) {
          this.logger.warn(
            `User ${user.id} attempted to use resource ${resourceId} during maintenance window without permissions`,
          );
          throw new ResourceUsageImpossibleMaintenanceInProgressException(resourceId);
        }

        this.logger.debug(`User ${user.id} has maintenance permissions, allowing usage during maintenance window`);
      }

      // Health gate: block non-maintenance users when any health entry is unhealthy.
      // Users that can manage maintenance are intentionally allowed through so they can investigate/repair.
      const isUnhealthy = await this.resourceHealthService.isResourceUnhealthy(resourceId);
      if (isUnhealthy) {
        const canManageMaintenance = await this.resourceMaintenanceService.canManageMaintenance(
          user,
          resourceId,
          transactionalEntityManager,
        );
        if (!canManageMaintenance) {
          this.logger.warn(`User ${user.id} blocked from resource ${resourceId} because it is currently unhealthy`);
          throw new ResourceUnhealthyException(resourceId);
        }
        this.logger.debug(
          `User ${user.id} has maintenance permissions, allowing usage despite unhealthy state on resource ${resourceId}`,
        );
      }
    }

    if (checkControlPermission) {
      const canStartSession = await this.canControllResource(resourceId, user, transactionalEntityManager);

      if (!canStartSession) {
        this.logger.warn(`User ${user.id} cannot control resource ${resourceId} - missing introduction`);
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
    }

    return resource;
  }

  private getResourceUsageFlowPayload(resourceUsage: ResourceUsage, formSubmissions?: FormSubmission[]) {
    const normalizedFormSubmissions = formSubmissions ?? [];
    const mappedFormSubmissions: {
      [key: string]: { formName: string; answers: { [key: number]: { value: string; name: string } } };
    } = {};

    normalizedFormSubmissions.forEach((submission) => {
      mappedFormSubmissions[submission.form.id] = {
        formName: submission.form.name,
        answers: Object.fromEntries(
          Object.values(submission.data).map((field) => [
            field.fieldDefinition.id,
            { value: field.value, name: field.fieldDefinition.name },
          ]),
        ),
      };
    });

    const usageUser =
      resourceUsage.user ??
      (resourceUsage.userId != null ? ({ id: resourceUsage.userId } as Pick<User, 'id'> & Partial<User>) : undefined);

    const sanitizedUser: (Partial<User> & Pick<User, 'id'>) | undefined = usageUser
      ? {
          id: usageUser.id,
          username: usageUser.username,
          email: usageUser.email,
          createdAt: usageUser.createdAt,
          updatedAt: usageUser.updatedAt,
          billingFactor: usageUser.billingFactor,
          creditBalance: usageUser.creditBalance,
        }
      : undefined;

    const flowPayload = {
      ...resourceUsage,
      resource: {
        ...resourceUsage.resource,
        documentationMarkdown: undefined,
        documentationUrl: undefined,
        documentationType: undefined,
        metadata: resourceUsage.resource?.metadata ?? null,
      } as Partial<Resource>,
      user: sanitizedUser,
      formSubmissions: mappedFormSubmissions,
    };

    return flowPayload;
  }

  async startSession(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    options: StartSessionOptions = {},
  ): Promise<ResourceUsage> {
    this.logger.debug(`Starting session for resource ${resourceId} by user ${user.id}`, { dto, options });

    const supervisorUserId = options.supervisorUserId ?? null;

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let endedUsageIdToEmit: number | null = null;
    let startedUsageIdToEmit: number | null = null;
    let takeoverEndedUser: User | null = null;

    const newSession = await this.resourceUsageRepository.manager.transaction(async (transactionalEntityManager) => {
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

      const existingActiveSession = await this.getActiveSession(resourceId, false, transactionalEntityManager);
      if (existingActiveSession) {
        this.logger.debug(
          `Found existing active session for resource ${resourceId} by user ${existingActiveSession.user.id}`,
        );

        // If there's an active session, check if takeover is allowed
        if (dto.forceTakeOver && resource.allowTakeOver) {
          this.logger.debug(
            `Forcing takeover of resource ${resourceId} from user ${existingActiveSession.user.id} to user ${user.id}`,
          );

          const takeoverEndTime = new Date();

          // End the existing session with a note about takeover
          await transactionalEntityManager
            .createQueryBuilder()
            .update(ResourceUsage)
            .set({
              endTime: takeoverEndTime,
              endNotes: `Session ended due to takeover by user ${user.id}`,
            })
            .where('id = :id', { id: existingActiveSession.id })
            .execute();

          const updatedSession = await transactionalEntityManager.findOne(ResourceUsage, {
            where: { id: existingActiveSession.id },
            relations: ['user', 'resource'],
          });

          // Charge the previous user's ended session
          await this.billingService.chargeForResourceUsage(updatedSession, transactionalEntityManager);

          // Defer event for the ended session until after commit
          endedUsageIdToEmit = updatedSession.id;
          takeoverEndedUser = existingActiveSession.user;
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
      };

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

      this.logger.debug(
        `Successfully created session ${createdSession.id} for resource ${resourceId} by user ${user.id}`,
      );

      let formSubmissions: FormSubmission[] = [];
      if (resource.type === ResourceType.Machine) {
        const action = dto.forceTakeOver ? ResourceFormAction.TAKEOVER : ResourceFormAction.START;
        formSubmissions = await this.resourceFormsService.saveRequiredSubmissions({
          resourceId,
          action,
          submissions: dto.formSubmissions,
          userId: user.id,
          resourceUsageId: createdSession.id,
          manager: transactionalEntityManager,
        });
      }

      await this.billingService.handleResourceUsageStart(resourceId, createdSession, user, transactionalEntityManager);

      if (existingActiveSession) {
        const now = new Date();

        await this.flowExecutorService.runFlow(
          existingActiveSession.resourceId,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
          {
            ...this.getResourceUsageFlowPayload(existingActiveSession, formSubmissions),
            takeOverTime: now,
            newUser: user,
            oldUser: existingActiveSession.user,
          },
          transactionalEntityManager,
        );

        // Emit event for the takeover
        this.eventEmitter.emit(
          ResourceUsageSessionTakenOverEvent.EVENT_NAME,
          new ResourceUsageSessionTakenOverEvent(resource, now, user, existingActiveSession.user),
        );
      } else {
        // Defer event for the newly started session until after commit
        startedUsageIdToEmit = createdSession.id;

        await this.flowExecutorService.runFlow(
          createdSession.resourceId,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
          this.getResourceUsageFlowPayload(createdSession, formSubmissions),
          transactionalEntityManager,
        );
      }

      this.flowExecutorService.trackResourceActivity(createdSession.resourceId);
      await transactionalEntityManager.update(ResourceUsage, createdSession.id, { isFinalized: true });
      return await transactionalEntityManager.findOne(ResourceUsage, {
        where: { id: createdSession.id },
        relations: ['resource', 'user', 'project'],
      });
    });

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

    return newSession;
  }

  async endSession(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    options: EndSessionOptions = {},
  ): Promise<ResourceUsage> {
    // skipNoteNotification: flow-ended sessions carry an auto-generated note, not a human one — skip personnel notification.
    const { skipFormSubmissions = false, skipNoteNotification = false } = options;

    this.logger.debug(`Ending session for resource ${resourceId} by user ${user.id}`, { dto });

    // Find active session
    const activeSession = await this.getActiveSession(resourceId, true);
    if (!activeSession) {
      throw new BadRequestException('No active session found');
    }

    // Check if the user is authorized to end the session
    const userPermissions = await this.rbacService.getEffectivePermissions(user.id);
    const canManageResources = userPermissions.has('resources.update');
    const isSessionOwner = activeSession.user.id === user.id;
    // The supervisor of a supervised session may end it as well.
    const isSupervisor = activeSession.supervisorUserId != null && activeSession.supervisorUserId === user.id;

    if (!isSessionOwner && !isSupervisor && !canManageResources) {
      const canMaintain = await this.resourceIntroducersService.canMaintain(activeSession.resourceId, user.id, true);
      if (!canMaintain) {
        this.logger.warn(
          `User ${user.id} not authorized to end session ${activeSession.id} owned by user ${activeSession.user.id}`,
        );
        throw new ForbiddenException('You are not authorized to end this session');
      }
    }

    const endTime = new Date();

    this.logger.debug(`Ending session ${activeSession.id} at ${endTime.toISOString()}`);

    let endNotes = dto.notes;

    if (!isSessionOwner) {
      endNotes = `[By #${user.id} - ${user.username}] ${endNotes ?? ''}`;
    }

    // Defer event emission until after the transaction commits to avoid stale reads in listeners
    let endedUsageIdToEmit: number | null = null;
    let formSubmissions: FormSubmission[] = [];
    const executeEndSession = async () =>
      await this.resourceUsageRepository.manager.transaction(async (transactionalEntityManager) => {
        const updateData = {
          endTime,
          endNotes,
        };

        if (!skipFormSubmissions && activeSession.resource?.type === ResourceType.Machine) {
          formSubmissions = await this.resourceFormsService.saveRequiredSubmissions({
            resourceId,
            action: ResourceFormAction.END,
            submissions: dto.formSubmissions,
            userId: user.id,
            resourceUsageId: activeSession.id,
            manager: transactionalEntityManager,
          });
        }

        this.logger.debug(`Running flow for resource ${activeSession.resourceId} on end session`, { updateData });
        await this.flowExecutorService.runFlow(
          activeSession.resourceId,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
          { ...this.getResourceUsageFlowPayload(activeSession, formSubmissions), ...updateData },
          transactionalEntityManager,
        );

        this.logger.debug(`Updating session ${activeSession.id} with end time and notes`, { updateData });

        // Update session with end time and notes - using explicit update to avoid the generated column
        await transactionalEntityManager
          .createQueryBuilder()
          .update(ResourceUsage)
          .set(updateData)
          .where('id = :id', { id: activeSession.id })
          .execute();

        this.logger.debug(`Successfully ended session ${activeSession.id}`);

        const updatedUsage = await transactionalEntityManager.getRepository(ResourceUsage).findOne({
          where: { id: activeSession.id },
          relations: ['resource', 'user'],
        });

        await this.billingService.chargeForResourceUsage(updatedUsage, transactionalEntityManager);

        // Defer event after successful save until after commit
        endedUsageIdToEmit = activeSession.id;

        // Fetch the updated record
        return updatedUsage;
      });

    const updatedUsage = await this.runSerializedIfSqlite(this.resourceUsageRepository.manager, executeEndSession);

    // Emit event after the transaction committed to ensure readers can observe DB state
    try {
      if (endedUsageIdToEmit) {
        await this.emitUsageEvent(endedUsageIdToEmit);
      }
    } catch (error) {
      this.logger.error(`Failed to emit usage event after endSession commit`, (error as Error).stack);
    }

    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, updatedUsage?.resource, updatedUsage?.user);

    if (updatedUsage?.user?.id && (updatedUsage.user.id !== user.id || skipNoteNotification)) {
      this.eventEmitter.emit(
        ResourceUsageSessionEndedEvent.EVENT_NAME,
        new ResourceUsageSessionEndedEvent(
          updatedUsage,
          skipNoteNotification ? null : { id: user.id, username: user.username },
        ),
      );
    }

    // Counter signal for supervised-usage auto-promotion (ATT-488): every completed supervised session
    // is counted by the listener to decide when to auto-create an introduction for the supervised user.
    if (activeSession.supervisorUserId != null && activeSession.user?.id != null) {
      this.eventEmitter.emit(
        ResourceSupervisedUsageEndedEvent.EVENT_NAME,
        new ResourceSupervisedUsageEndedEvent(
          resourceId,
          activeSession.user.id,
          activeSession.supervisorUserId,
          activeSession.id,
        ),
      );
    }

    this.metricsService.resourceUsageSessionsTotal.inc({ action: 'end' });
    this.metricsService.resourceUsageSessionsActive.dec();
    if (updatedUsage?.startTime && updatedUsage?.endTime) {
      const durationSeconds = (updatedUsage.endTime.getTime() - updatedUsage.startTime.getTime()) / 1000;
      this.metricsService.resourceUsageDurationSeconds.observe(durationSeconds);
    }

    if (!skipNoteNotification && dto.notes?.trim()) {
      this.eventEmitter.emit(
        ResourceUsageNoteAddedEvent.EVENT_NAME,
        new ResourceUsageNoteAddedEvent(resourceId, dto.notes.trim(), 'end', {
          id: user.id,
          username: user.username,
        }),
      );
    }

    return updatedUsage;
  }

  async updateSessionProject(
    resourceId: number,
    usageId: number,
    user: User,
    dto: UpdateUsageSessionProjectDto,
  ): Promise<ResourceUsage> {
    this.logger.debug(`Updating project for usage session ${usageId} on resource ${resourceId} by user ${user.id}`, {
      dto,
    });

    const usage = await this.resourceUsageRepository.findOne({
      where: { id: usageId, resourceId },
      relations: ['user', 'project', 'resource'],
    });

    if (!usage) {
      throw new NotFoundException('Usage session not found');
    }

    if (!usage.endTime) {
      throw new BadRequestException('Usage session is still active');
    }

    if (usage.usageAction !== ResourceUsageAction.Usage) {
      throw new BadRequestException('Only usage sessions can be assigned to projects');
    }

    if (usage.userId !== user.id) {
      this.logger.warn(`User ${user.id} not authorized to update session ${usage.id} owned by user ${usage.userId}`);
      throw new ForbiddenException('You are not authorized to update this session');
    }

    if (dto.projectId === undefined) {
      throw new BadRequestException('Project assignment is required');
    }

    if (dto.projectId === null) {
      usage.projectId = null;
      usage.project = null;
    } else {
      const project = await this.projectsService.findOneById(user.id, dto.projectId);
      usage.projectId = project.id;
      usage.project = project;
    }

    await this.resourceUsageRepository.save(usage);

    return await this.resourceUsageRepository.findOne({
      where: { id: usage.id },
      relations: ['resource', 'user', 'project'],
    });
  }

  private async emitUsageEvent(usageId: number, transactionalEntityManager?: EntityManager): Promise<void> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    const usage = await resourceUsageRepository.findOne({
      where: { id: usageId },
      relations: ['resource', 'user'],
    });
    await this.eventEmitter.emitAsync(ResourceSessionStartedEvent.EVENT_NAME, new ResourceSessionStartedEvent(usage));
  }

  private async handleDoorAction(resourceId: number, user: User, action: ResourceUsageAction): Promise<ResourceUsage> {
    const usageData = {
      resourceId,
      usageAction: action,
      userId: user.id,
      startTime: new Date(),
      startNotes: null,
      endTime: new Date(),
      endNotes: null,
    };

    this.logger.debug(`persisting door action for resource ${resourceId}`, { usageData });

    let usage = await this.resourceUsageRepository.save(usageData, { reload: true });
    usage = await this.resourceUsageRepository.findOne({ where: { id: usage.id }, relations: ['user', 'resource'] });

    await this.emitUsageEvent(usage.id);

    return usage;
  }

  async lockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: true });

    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorLock);
  }

  async unlockDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: true });
    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException('Resource is not a door');
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorUnlock);
  }

  async unlatchDoor(resourceId: number, user: User): Promise<ResourceUsage> {
    const resource = await this.getResource(resourceId, user, { checkMaintenance: true, checkControlPermission: true });
    if (resource.type !== ResourceType.Door) {
      throw new BadRequestException(
        `Resource (ID: ${resourceId}${resource.name ? `, Name: ${resource.name}` : ''}) is not a door`,
      );
    }

    if (!resource.separateUnlockAndUnlatch) {
      throw new BadRequestException(
        `Door (ID: ${resourceId}${resource.name ? `, Name: ${resource.name}` : ''}) does not support unlatching`,
      );
    }

    return await this.handleDoorAction(resourceId, user, ResourceUsageAction.DoorUnlatch);
  }

  async getActiveSession(
    resourceId: number,
    onlyFinalized: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage | null> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    return await resourceUsageRepository.findOne({
      where: {
        resourceId,
        endTime: IsNull(),
        isFinalized: onlyFinalized ? true : undefined,
      },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    const whereClause: FindOneOptions<ResourceUsage>['where'] = { resourceId };

    // Add userId filter if provided
    if (userId) {
      whereClause.userId = userId;
      this.logger.debug(`Filtering usage history by userId ${userId}`);
    }

    const [data, total] = await this.resourceUsageRepository.findAndCount({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      order: { startTime: 'DESC' },
      relations: [
        'user',
        'project',
        'supervisorUser',
        'formSubmissions',
        'formSubmissions.form',
        'formSubmissions.user',
      ],
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }
}
