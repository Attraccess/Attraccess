import {
  FormSubmission,
  Resource,
  ResourceFlowNodeType,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Redis } from 'ioredis';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { BillingService } from '../../billing/billing.service';
import { MetricsService } from '../../metrics/metrics.service';
import { PluginEventsService } from '../../plugin-system/plugin-events.service';
import { ProjectsService } from '../../projects/projects.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { ResourceFormsService } from '../forms/forms.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceGroupsService } from '../groups/resourceGroups.service';
import { ResourceHealthService } from '../health/resource-health.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceIntroductionsService } from '../introductions/resouceIntroductions.service';
import { ResourceMaintenanceService } from '../maintenances/maintenance.service';
import { ResourceMeteringService } from '../metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../operating-intervals/resource-operating-attribution.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import type { ResourceUsageService } from './resourceUsage.service';
import { EndSessionOptions, StartSessionOptions } from './resourceUsage.service.feature-definitions';
import { UsageFlowPayload } from './usage-flow-payload';

export abstract class ResourceUsageServiceRouteContext {
  protected abstract readonly flowExecutorService: ResourceFlowsExecutorService;
  protected abstract readonly logger: Logger;
  protected abstract readonly operatingAttributionService: ResourceOperatingAttributionService | undefined;
  protected abstract readonly resourceUsageRepository: Repository<ResourceUsage>;
  protected abstract getLifecycleAttempt(
    manager: EntityManager,
    id: string,
    resourceId: number,
  ): Promise<ResourceUsageLifecycleAttempt>;
  protected abstract readonly metering?: ResourceMeteringService;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract runUsageFlow(
    manager: EntityManager | undefined,
    resourceId: number,
    triggerNodeType: ResourceFlowNodeType,
    payload: object,
    description: string,
    lifecycleAttemptId?: string,
    lifecycleCandidateCancellation?: boolean,
  ): Promise<void>;
  protected abstract getResourceUsageFlowPayload(
    resourceUsage: ResourceUsage,
    formSubmissions?: FormSubmission[],
  ): UsageFlowPayload;
  public abstract recoverInterruptedLifecycles(): Promise<void>;
  protected abstract cacheCleanupInterval: ReturnType<typeof setInterval> | null;
  protected abstract pruneAccessCache(): void;
  protected abstract readonly valkeyClient: Redis | null;
  protected abstract authorizationCacheSubscriber: Redis | null;
  protected abstract readonly accessCache: Map<
    string,
    { userId: number; resourceId: number; result: boolean; expiresAt: number }
  >;
  protected abstract readonly accessCacheKeysByUser: Map<number, Set<string>>;
  protected abstract deleteAccessCacheEntry(key: string): void;
  protected abstract readonly metricsService: MetricsService;
  protected abstract accessCacheGeneration: number;
  protected abstract canControllResourceUncached(
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean>;
  protected abstract readonly ACCESS_CACHE_TTL_MS: 30000;
  protected abstract readonly resourceRetrainingService: ResourceRetrainingService;
  protected abstract readonly ACCESS_CACHE_MAX_SIZE: 5000;
  protected abstract setAccessCacheEntry(
    key: string,
    entry: { userId: number; resourceId: number; result: boolean; expiresAt: number },
  ): void;
  protected abstract invalidateAccessCache(
    predicate?: (entry: { userId: number; resourceId: number }) => boolean,
  ): void;
  protected abstract invalidateUserAccessCache(userId: number): void;
  protected abstract readonly pluginEvents: PluginEventsService;
  protected abstract readonly accessCacheInFlight: Map<string, { generation: number; result: Promise<boolean> }>;
  protected abstract readonly rbacService: RbacService;
  protected abstract resolveAuthorizationCacheMiss(
    key: string,
    resourceId: number,
    user: User,
    canUpdateResource: boolean,
    transactionalEntityManager: EntityManager | undefined,
    generation: number,
  ): Promise<boolean>;
  protected abstract readonly resourceIntroductionService: ResourceIntroductionsService;
  protected abstract readonly resourceIntroducersService: ResourceIntroducersService;
  protected abstract readonly resourceGroupsService: ResourceGroupsService;
  protected abstract readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService;
  public abstract assertSupportsSupervision(
    resourceId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<Resource>;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly resourceMaintenanceService: ResourceMaintenanceService;
  protected abstract readonly resourceHealthService: ResourceHealthService;
  public abstract canControllResource(
    resourceId: number,
    user: User,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean>;
  protected abstract assertLifecycleAvailable(manager: EntityManager, resourceId: number): Promise<void>;
  protected abstract getResource(
    resourceId: number,
    user: User,
    opts: { checkMaintenance: boolean; checkControlPermission: boolean },
    transactionalEntityManager?: EntityManager,
  ): Promise<Resource>;
  public abstract validateSupervisedStart(
    resourceId: number,
    requester: User,
    supervisorUserId: number,
    transactionalEntityManager?: EntityManager,
    preloadedResource?: Resource,
  ): Promise<void>;
  public abstract getActiveSession(
    resourceId: number,
    onlyFinalized: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceUsage | null>;
  protected abstract readonly billingService: BillingService;
  protected abstract readonly projectsService: ProjectsService;
  protected abstract readonly resourceFormsService: ResourceFormsService;
  protected abstract prepareSessionStart(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    attemptId: string,
  ): Promise<{
    resource: Resource;
    createdSession: ResourceUsage;
    existingActiveSession: ResourceUsage;
    attempt: import('typeorm').DeepPartial<ResourceUsageLifecycleAttempt> & ResourceUsageLifecycleAttempt;
    formSubmissions: FormSubmission[];
  }>;
  protected abstract applyLifecycleDrafts(
    manager: EntityManager,
    attempt: ResourceUsageLifecycleAttempt,
  ): Promise<void>;
  protected abstract persistAttributedOperatingDuration(usage: ResourceUsage, manager: EntityManager): Promise<void>;
  protected abstract abortLifecycleAttempt(attemptId: string, resourceId: number): Promise<void>;
  protected abstract notifySessionStarted(
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
  ): Promise<void>;
  protected abstract readonly audit: AuditService;
  protected abstract emitUsageEvent(usageId: number, transactionalEntityManager?: EntityManager): Promise<void>;
  protected abstract emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: Resource | undefined,
    user: User | undefined,
  ): void;
  protected abstract notifySessionEnded(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    auditOrigin: NonNullable<EndSessionOptions['auditOrigin']>,
    updatedUsage: ResourceUsage,
    endedUsageIdToEmit: number | null,
    activeSession: ResourceUsage | null,
    skipNoteNotification: boolean,
  ): Promise<void>;
  protected abstract handleDoorAction(
    resourceId: number,
    user: User,
    action: ResourceUsageAction,
  ): Promise<ResourceUsage>;
  protected abstract readonly DETAIL_RELATIONS: string[];
}
