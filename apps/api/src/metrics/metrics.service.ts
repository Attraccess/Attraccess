import { activeUsageWhere } from '../resources/usage/sessions/active-usage';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  AttractapCrashReport,
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
import { normalizeResetReason } from './reset-reason';
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
  public readonly attractapResetReportsLastHour: Gauge;
  private scrapeQueue: Promise<unknown> = Promise.resolve();

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
    @InjectRepository(AttractapCrashReport)
    private readonly crashReportRepository: Repository<AttractapCrashReport>,
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
    this.attractapResetReportsLastHour = devices.attractapResetReportsLastHour;
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
        this.resourceUsageRepository.count({ where: activeUsageWhere() }),
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
    // Keep refresh and rendering together: a later scrape must not replace the
    // gauge while an earlier registry rendering is still collecting metrics.
    const scrape = this.scrapeQueue.then(async () => {
      const now = new Date();
      const driver = this.crashReportRepository.manager.connection.driver;
      const column = this.crashReportRepository.metadata.findColumnWithPropertyName('createdAt');
      const rows = await this.crashReportRepository
        .createQueryBuilder('report')
        .select('report.attractapId', 'readerId')
        .addSelect('report.resetReason', 'resetReason')
        .addSelect('COUNT(*)', 'count')
        .where('report.createdAt > :start AND report.createdAt <= :end', {
          start: driver.preparePersistentValue(new Date(now.getTime() - 3_600_000), column),
          end: driver.preparePersistentValue(now, column),
        })
        .groupBy('report.attractapId')
        .addGroupBy('report.resetReason')
        .getRawMany<{ readerId: number; resetReason: string; count: string | number }>();
      const counts = new Map<string, { reader_id: string; reset_reason: string; count: number }>();
      for (const row of rows) {
        const reader_id = String(row.readerId);
        const reset_reason = normalizeResetReason(row.resetReason);
        const key = `${reader_id}:${reset_reason}`;
        const previous = counts.get(key);
        counts.set(key, { reader_id, reset_reason, count: (previous?.count ?? 0) + Number(row.count) });
      }
      // Replace only after a successful query. On failure the scrape rejects.
      this.attractapResetReportsLastHour.reset();
      for (const { reader_id, reset_reason, count } of counts.values()) {
        this.attractapResetReportsLastHour.set({ reader_id, reset_reason }, count);
      }
      return this.registry.metrics();
    });
    this.scrapeQueue = scrape.catch(() => undefined);
    return scrape;
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
