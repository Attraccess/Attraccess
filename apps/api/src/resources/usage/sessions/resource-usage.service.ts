import { ResourceUsage, User, ResourceType, ResourceUsageAction } from '@attraccess/application-models';

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

import { UsagePersistence } from '../persistence/port';

import { Redis } from 'ioredis';

import { DatabaseTransactions, TransactionScope } from '../../../database/transaction-scope';

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

import { AuthenticatedUser, SystemEvent } from '@attraccess/plugins-backend-sdk/v2';

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
    @Inject(UsagePersistence) protected readonly persistence: UsagePersistence,
    protected readonly transactions: DatabaseTransactions,
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

  public async getActiveSession(
    resourceId: number,
    transactionalEntityManager?: TransactionScope,
  ): Promise<ResourceUsage | null> {
    return this.usageOperations(transactionalEntityManager).activeSession(resourceId);
  }

  public async getActiveSessions(resourceIds: number[]): Promise<Map<number, ResourceUsage | null>> {
    const map = new Map<number, ResourceUsage | null>(resourceIds.map((id) => [id, null]));
    if (resourceIds.length === 0) return map;
    const sessions = await this.persistence.activeSessions(resourceIds);
    for (const session of sessions) {
      // Legacy duplicates are retained for explicit resolution. Single and bulk reads agree.
      if (!map.get(session.resourceId)) map.set(session.resourceId, session);
    }
    return map;
  }

  async getSessionDetails(resourceId: number, usageId: number, user: AuthenticatedUser): Promise<ResourceUsage> {
    const usage = await this.persistence.sessionDetails(resourceId, usageId);
    if (!usage) throw new NotFoundException('Usage session not found');

    if (usage.userId !== user.id && !user.effectivePermissions?.has('resources.update')) {
      if (!usage.projectId) throw new NotFoundException('Usage session not found');
      await this.projectsService.findOneById(user.id, usage.projectId);
    }

    return usage;
  }

  async getResourceUsageHistory(
    resourceId: number,
    page = 1,
    limit = 10,
    userId?: number,
  ): Promise<{ data: ResourceUsage[]; total: number }> {
    if (userId) this.logger.debug(`Filtering usage history by userId ${userId}`);
    const [data, total] = await this.persistence.history(resourceId, userId, (page - 1) * limit, limit);

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

    const usage = await this.transactions.run({ resourceIds: [resourceId], accountIds: [] }, async (scope) => {
      const saved = await this.usageOperations(scope).saveUsage(usageData);
      return this.usageOperations(scope).usageWithResourceAndUser(saved.id);
    });

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

    const usage = await this.persistence.usageForProjectUpdate(resourceId, usageId);
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

    await this.persistence.saveUsage(usage);

    return await this.persistence.usageWithProject(usage.id);
  }

  protected async emitUsageEvent(usageId: number, transactionalEntityManager?: TransactionScope): Promise<void> {
    const usage = await this.usageOperations(transactionalEntityManager).usageWithResourceAndUser(usageId);
    const emit = async () => {
      await this.eventEmitter.emitAsync(ResourceSessionStartedEvent.EVENT_NAME, new ResourceSessionStartedEvent(usage));
    };
    if (transactionalEntityManager) transactionalEntityManager.afterCommit(emit);
    else await emit();
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
}
