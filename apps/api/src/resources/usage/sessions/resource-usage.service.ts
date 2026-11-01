import {
  Resource,
  ResourceUsage,
  User,
  ResourceType,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/database-entities';
import { ResourceInUseError } from '../errors/resource-in-use.error';

import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { InjectRepository } from '@nestjs/typeorm';

import { Redis } from 'ioredis';

import { Repository, EntityManager, FindOneOptions, In } from 'typeorm';

import { AuditService } from '../../../audit/audit.service';

import { BillingService } from '../../../billing/charges/billing.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { PluginEventsService } from '../../../plugin-system/plugin-events.service';

import { ProjectsService } from '../../../projects/projects.service';

import { RbacService } from '../../../users-and-auth/rbac/rbac.service';

import { VALKEY_CLIENT } from '../../../valkey/valkey.module';

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

import { AuthenticatedUser, SystemEvent } from '@attraccess/plugins-backend-sdk';

import { activeUsageWhere, getSessionCapacity } from './active-usage';

import { UpdateUsageSessionProjectDto } from '../dtos/updateUsageSessionProject.dto';

import {
  ResourceSessionStartedEvent,
  ResourceSupervisedUsageEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
} from '../events/resource-usage.events';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { EndSessionOptions } from '../lifecycle/usage-lifecycle';

import { UsageSessions } from './usage-sessions';

export { EndSessionOptions, StartSessionOptions } from '../lifecycle/usage-lifecycle';

@Injectable()
export class ResourceUsageService extends UsageSessions implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    protected readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    protected readonly resourceIntroductionService: ResourceIntroductionsService,
    protected readonly resourceIntroducersService: ResourceIntroducersService,
    protected readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService,
    protected readonly resourceGroupsService: ResourceGroupsService,
    protected readonly resourceRetrainingService: ResourceRetrainingService,
    protected readonly resourceMaintenanceService: ResourceMaintenanceService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly billingService: BillingService,
    @Optional() protected readonly operatingAttributionService: ResourceOperatingAttributionService | undefined,
    @Inject(forwardRef(() => ResourceFlowsExecutorService))
    protected readonly flowExecutorService: ResourceFlowsExecutorService,
    protected readonly projectsService: ProjectsService,
    protected readonly resourceFormsService: ResourceFormsService,
    protected readonly metricsService: MetricsService,
    protected readonly resourceHealthService: ResourceHealthService,
    protected readonly pluginEvents: PluginEventsService,
    protected readonly rbacService: RbacService,
    protected readonly audit: AuditService,
    @Inject(VALKEY_CLIENT) protected readonly valkeyClient: Redis | null,
    @Optional()
    @Inject(forwardRef(() => ResourceMeteringService))
    protected readonly metering?: ResourceMeteringService,
  ) {
    super();
  }

  protected readonly logger = new Logger(ResourceUsageService.name);

  protected readonly accessCache = new Map<
    string,
    { userId: number; resourceId: number; result: boolean; expiresAt: number }
  >();

  protected readonly accessCacheKeysByUser = new Map<number, Set<string>>();

  protected readonly accessCacheInFlight = new Map<string, { generation: number; result: Promise<boolean> }>();

  protected readonly ACCESS_CACHE_TTL_MS = 30_000;

  protected readonly ACCESS_CACHE_MAX_SIZE = 5_000;

  protected cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

  protected authorizationCacheSubscriber: Redis | null = null;

  protected accessCacheGeneration = 0;

  protected readonly DETAIL_RELATIONS = [
    'user',
    'project',
    'supervisorUser',
    'formSubmissions',
    'formSubmissions.form',
    'formSubmissions.user',
  ];

  /**
   * The caller's own active session when `preferUserId` has one, otherwise the newest.
   * Identical to the single-session behaviour at limit 1.
   */
  public async getActiveSession(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preferUserId?: number,
  ): Promise<ResourceUsage | null> {
    const sessions = await this.getActiveSessionsForResource(resourceId, transactionalEntityManager);
    if (sessions.length === 0) return null;
    return (
      (preferUserId === undefined ? undefined : sessions.find((session) => session.userId === preferUserId)) ??
      sessions[sessions.length - 1]
    );
  }

  /** All active sessions of one resource, earliest started first. */
  public async getActiveSessionsForResource(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage[]> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    return await resourceUsageRepository.find({
      where: { resourceId, ...activeUsageWhere() },
      order: { startTime: 'ASC', id: 'ASC' },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
  }

  public async getActiveSessions(resourceIds: number[]): Promise<Map<number, ResourceUsage[]>> {
    const map = new Map<number, ResourceUsage[]>(resourceIds.map((id) => [id, []]));
    if (resourceIds.length === 0) return map;
    const sessions = await this.resourceUsageRepository.find({
      where: { resourceId: In(resourceIds), ...activeUsageWhere() },
      order: { startTime: 'ASC', id: 'ASC' },
      relations: ['user', 'resource', 'billingTransaction', 'project', 'supervisorUser'],
    });
    for (const session of sessions) map.get(session.resourceId)?.push(session);
    return map;
  }

  public async getActiveSessionOverview(
    resourceId: number,
    userId: number,
  ): Promise<{
    usage: ResourceUsage | null;
    usages: ResourceUsage[];
    activeSessionCount: number;
    maxParallelSessions: number;
    isFull: boolean;
  }> {
    const [usages, resource] = await Promise.all([
      this.getActiveSessionsForResource(resourceId),
      this.resourceRepository.findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      }),
    ]);
    const usage = usages.find((session) => session.userId === userId) ?? usages[usages.length - 1] ?? null;
    return {
      usage,
      usages,
      ...getSessionCapacity(
        { type: resource?.type ?? ResourceType.Machine, maxParallelSessions: resource?.maxParallelSessions ?? 1 },
        usages.length,
      ),
    };
  }

  /**
   * Opens a session for a viewer. Allowed: their own, any when `canViewAll`, and project-linked ones for members of
   * that project (as on main, whatever their activity access). Otherwise `redact` gives the view they may have, or
   * the session does not exist for them: always a 404, so nothing tells a hidden session from a missing one.
   */
  async getSessionDetails(
    resourceId: number,
    usageId: number,
    user: AuthenticatedUser,
    canViewAll = false,
    redact?: (usage: ResourceUsage) => ResourceUsage,
  ): Promise<ResourceUsage> {
    const usage = await this.resourceUsageRepository.findOne({
      where: { id: usageId, resourceId, lifecyclePending: false },
      relations: this.DETAIL_RELATIONS,
    });
    if (!usage) throw new NotFoundException('Usage session not found');
    if (usage.userId === user.id || canViewAll) return usage;

    if (usage.projectId) {
      try {
        await this.projectsService.findOneById(user.id, usage.projectId);
        return usage;
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    if (redact) return redact(usage);
    throw new NotFoundException('Usage session not found');
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    const whereClause: FindOneOptions<ResourceUsage>['where'] = { resourceId, lifecyclePending: false };

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
      relations: this.DETAIL_RELATIONS,
    });

    this.logger.debug(`Found ${data.length} usage records out of ${total} total for resource ${resourceId}`);

    return { data, total };
  }

  protected async handleDoorAction(
    resourceId: number,
    user: User,
    action: ResourceUsageAction,
  ): Promise<ResourceUsage> {
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

  protected async emitUsageEvent(usageId: number, transactionalEntityManager?: EntityManager): Promise<void> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    const usage = await resourceUsageRepository.findOne({
      where: { id: usageId },
      relations: ['resource', 'user'],
    });
    // An ended usage session is announced by ResourceUsageSessionEndedEvent (or the take-over event), never as a
    // start. Door actions are stored already ended and still fire this event.
    if (usage?.usageAction === ResourceUsageAction.Usage && usage.endTime) return;
    await this.eventEmitter.emitAsync(ResourceSessionStartedEvent.EVENT_NAME, new ResourceSessionStartedEvent(usage));
  }

  protected async notifySessionEnded(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    auditOrigin: NonNullable<EndSessionOptions['auditOrigin']>,
    updatedUsage: ResourceUsage,
    endedUsageIdToEmit: number | null,
    activeSession: ResourceUsage | null,
    skipNoteNotification: boolean,
  ): Promise<void> {
    await this.audit
      .recordResource({
        action: 'usage_session.ended',
        ...auditOrigin,
        subjectId: resourceId,
        details: { usageId: updatedUsage.id, usageUserId: updatedUsage.userId },
      })
      .catch(() => undefined);

    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, updatedUsage?.resource, updatedUsage?.user);

    // Emitted after the transaction committed so listeners observe DB state. Every end fires it exactly once
    // (live feed, reader resource lists, maintenance evaluation); the notification listener skips self-ends.
    if (endedUsageIdToEmit && updatedUsage) {
      try {
        this.eventEmitter.emit(
          ResourceUsageSessionEndedEvent.EVENT_NAME,
          new ResourceUsageSessionEndedEvent(
            updatedUsage,
            skipNoteNotification ? null : { id: user.id, username: user.username },
          ),
        );
      } catch (error) {
        this.logger.error(`Failed to emit session ended event after endSession commit`, (error as Error).stack);
      }
    }

    // Counter signal for supervised-usage auto-promotion (ATT-488): every completed supervised session
    // is counted by the listener to decide when to auto-create an introduction for the supervised user.
    if (activeSession?.supervisorUserId != null && activeSession.user?.id != null) {
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
    await this.assertLifecycleAvailable(this.resourceUsageRepository.manager, resourceId);
    const resource = await this.getResource(resourceId, user, {
      checkMaintenance: true,
      checkControlPermission: false,
    });
    if (supervisorUserId === null) {
      if (!(await this.canControllResource(resourceId, user))) {
        throw new BadRequestException('You must complete the resource introduction before using it');
      }
      if (resource.supervisionMode === SupervisionMode.SUPERVISION_REQUIRED) {
        throw new BadRequestException('This resource requires a supervisor; request a supervised session instead');
      }
    } else {
      await this.validateSupervisedStart(resourceId, user, supervisorUserId, undefined, resource);
    }
    if (resource.type !== ResourceType.Machine) throw new BadRequestException('Resource is not a machine');
    const active = await this.getActiveSession(resourceId);
    if (!active) return;
    if (!dto.forceTakeOver) throw new ResourceInUseError();
    if (!resource.allowTakeOver) throw new BadRequestException('This resource does not allow overtaking');
  }
}
