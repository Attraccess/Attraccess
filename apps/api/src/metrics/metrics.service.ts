import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import {
  User,
  Resource,
  Project,
  ResourceGroup,
  MqttServer,
  ResourceUsage,
  Session,
} from '@attraccess/database-entities';
import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';
import { PluginService } from '../plugin-system/plugin.service';
import { createIdentityMetrics } from './definitions/identity.metrics';
import { createResourcesMetrics } from './definitions/resources.metrics';
import { createDevicesMetrics } from './definitions/devices.metrics';
import { createOperationsMetrics } from './definitions/operations.metrics';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  public readonly registry: Registry;

  public readonly authLoginTotal: Counter;
  public readonly authActiveSessions: Gauge;
  public readonly authSsoLoginTotal: Counter;
  public readonly authSsoLoginFailuresTotal: Counter;
  public readonly auth2faUsageTotal: Counter;

  public readonly usersTotal: Gauge;
  public readonly usersRegisteredTotal: Counter;
  public readonly usersLocaleSyncsTotal: Counter;
  public readonly usersPerLocale: Gauge;

  public readonly resourcesTotal: Gauge;
  public readonly resourceUsageSessionsActive: Gauge;
  public readonly resourceUsageSessionsTotal: Counter;
  public readonly resourceUsageDurationSeconds: Histogram;
  public readonly resourceGroupsTotal: Gauge;
  public readonly resourceIntroductionsTotal: Counter;
  public readonly resourceMaintenanceTotal: Counter;
  public readonly resourceMaintenanceOverdue: Gauge;

  public readonly attractapDevicesConnected: Gauge;
  public readonly attractapReaderConnected: Gauge;
  public readonly attractapNfcTapsTotal: Counter;
  public readonly attractapFirmwareUpdatesTotal: Counter;
  public readonly attractapCrashReportsTotal: Counter;

  public readonly billingTransactionsTotal: Counter;
  public readonly billingTransactionAmount: Histogram;

  public readonly projectsTotal: Gauge;

  public readonly emailSentTotal: Counter;

  public readonly mqttServersTotal: Gauge;
  public readonly mqttServersHealthy: Gauge;

  public readonly pluginsLoaded: Gauge;

  public readonly companionDownloadsTotal: Counter;

  public readonly authorizationCacheRequestsTotal: Counter;
  public readonly authorizationCacheSize: Gauge;
  public readonly maintenanceUsageQueryWindowDays: Histogram;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    const identity = createIdentityMetrics(this.registry);
    this.authLoginTotal = identity.authLoginTotal;
    this.authActiveSessions = identity.authActiveSessions;
    this.authSsoLoginTotal = identity.authSsoLoginTotal;
    this.authSsoLoginFailuresTotal = identity.authSsoLoginFailuresTotal;
    this.auth2faUsageTotal = identity.auth2faUsageTotal;
    this.usersTotal = identity.usersTotal;
    this.usersRegisteredTotal = identity.usersRegisteredTotal;
    this.usersLocaleSyncsTotal = identity.usersLocaleSyncsTotal;
    this.usersPerLocale = identity.usersPerLocale;
    const resources = createResourcesMetrics(this.registry);
    this.resourcesTotal = resources.resourcesTotal;
    this.resourceUsageSessionsActive = resources.resourceUsageSessionsActive;
    this.resourceUsageSessionsTotal = resources.resourceUsageSessionsTotal;
    this.resourceUsageDurationSeconds = resources.resourceUsageDurationSeconds;
    this.resourceGroupsTotal = resources.resourceGroupsTotal;
    this.resourceIntroductionsTotal = resources.resourceIntroductionsTotal;
    this.resourceMaintenanceTotal = resources.resourceMaintenanceTotal;
    this.resourceMaintenanceOverdue = resources.resourceMaintenanceOverdue;
    const devices = createDevicesMetrics(this.registry);
    this.attractapDevicesConnected = devices.attractapDevicesConnected;
    this.attractapReaderConnected = devices.attractapReaderConnected;
    this.attractapNfcTapsTotal = devices.attractapNfcTapsTotal;
    this.attractapFirmwareUpdatesTotal = devices.attractapFirmwareUpdatesTotal;
    this.attractapCrashReportsTotal = devices.attractapCrashReportsTotal;
    const operations = createOperationsMetrics(this.registry);
    this.billingTransactionsTotal = operations.billingTransactionsTotal;
    this.billingTransactionAmount = operations.billingTransactionAmount;
    this.projectsTotal = operations.projectsTotal;
    this.emailSentTotal = operations.emailSentTotal;
    this.mqttServersTotal = operations.mqttServersTotal;
    this.mqttServersHealthy = operations.mqttServersHealthy;
    this.pluginsLoaded = operations.pluginsLoaded;
    this.companionDownloadsTotal = operations.companionDownloadsTotal;
    this.authorizationCacheRequestsTotal = operations.authorizationCacheRequestsTotal;
    this.authorizationCacheSize = operations.authorizationCacheSize;
    this.maintenanceUsageQueryWindowDays = operations.maintenanceUsageQueryWindowDays;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing gauge metrics from database...');
    const [users, resources, projects, groups, mqttServers, activeUsageSessions, activeAuthSessions, localeCounts] =
      await Promise.all([
        this.userRepository.count(),
        this.resourceRepository.count(),
        this.projectRepository.count(),
        this.resourceGroupRepository.count(),
        this.mqttServerRepository.count(),
        this.resourceUsageRepository.count({ where: { endTime: IsNull(), lifecyclePending: false } }),
        this.sessionRepository.count({ where: { expiresAt: MoreThan(new Date()) } }),
        this.userRepository
          .createQueryBuilder('user')
          .select('user.locale', 'locale')
          .addSelect('COUNT(*)', 'count')
          .groupBy('user.locale')
          .getRawMany<{ locale: string; count: string }>(),
      ]);

    this.usersTotal.set(users);
    this.resourcesTotal.set(resources);
    this.projectsTotal.set(projects);
    this.resourceGroupsTotal.set(groups);
    this.mqttServersTotal.set(mqttServers);
    this.resourceUsageSessionsActive.set(activeUsageSessions);
    this.authActiveSessions.set(activeAuthSessions);
    for (const row of localeCounts) {
      this.usersPerLocale.set({ locale: row.locale ?? 'en' }, parseInt(row.count, 10));
    }

    try {
      this.pluginsLoaded.set(PluginService.getPlugins().length);
    } catch (err) {
      this.logger.warn(`Could not enumerate plugins for metric: ${(err as Error).message}`);
      this.pluginsLoaded.set(0);
    }

    this.logger.log(
      `Gauge metrics initialized: users=${users}, resources=${resources}, projects=${projects}, groups=${groups}, mqttServers=${mqttServers}, activeUsageSessions=${activeUsageSessions}, activeAuthSessions=${activeAuthSessions}`,
    );
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
