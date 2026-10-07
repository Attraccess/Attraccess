import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { forwardRef, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { BillingService } from '../../billing/billing.service';
import { MetricsService } from '../../metrics/metrics.service';
import { PluginEventsService } from '../../plugin-system/plugin-events.service';
import { ProjectsService } from '../../projects/projects.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { VALKEY_CLIENT } from '../../valkey/valkey.module';
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
import { UsageSessionQueriesImplementation } from './usage-session-queries';

@Injectable()
export class ResourceUsageService extends UsageSessionQueriesImplementation implements OnModuleInit, OnModuleDestroy {
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

  protected readonly DETAIL_RELATIONS = [
    'user',
    'project',
    'supervisorUser',
    'formSubmissions',
    'formSubmissions.form',
    'formSubmissions.user',
  ];
}

export { EndSessionOptions, StartSessionOptions } from './resourceUsage.service.feature-definitions';
