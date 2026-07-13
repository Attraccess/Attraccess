import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { User, Resource, Project, ResourceGroup, MqttServer, ResourceUsage, Session } from '@attraccess/database-entities';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
} from 'prom-client';
import { PluginService } from '../plugin-system/plugin.service';

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

    this.authLoginTotal = new Counter({
      name: 'attraccess_auth_login_total',
      help: 'Total number of login attempts',
      labelNames: ['method', 'status'],
      registers: [this.registry],
    });

    this.authActiveSessions = new Gauge({
      name: 'attraccess_auth_active_sessions',
      help: 'Number of active authenticated sessions',
      registers: [this.registry],
    });

    this.authSsoLoginTotal = new Counter({
      name: 'attraccess_auth_sso_login_total',
      help: 'Total number of successful SSO login attempts',
      labelNames: ['provider_type'],
      registers: [this.registry],
    });

    this.authSsoLoginFailuresTotal = new Counter({
      name: 'attraccess_auth_sso_login_failures_total',
      help: 'Total number of failed SSO login attempts',
      labelNames: ['provider_type', 'reason'],
      registers: [this.registry],
    });

    this.auth2faUsageTotal = new Counter({
      name: 'attraccess_auth_2fa_usage_total',
      help: 'Total number of 2FA actions',
      labelNames: ['action'],
      registers: [this.registry],
    });

    this.usersTotal = new Gauge({
      name: 'attraccess_users_total',
      help: 'Total number of registered users',
      registers: [this.registry],
    });

    this.usersRegisteredTotal = new Counter({
      name: 'attraccess_users_registered_total',
      help: 'Total number of user registrations',
      registers: [this.registry],
    });

    this.usersLocaleSyncsTotal = new Counter({
      name: 'attraccess_users_locale_syncs_total',
      help: 'Total number of user locale sync calls, labelled by locale',
      labelNames: ['locale'],
      registers: [this.registry],
    });

    this.usersPerLocale = new Gauge({
      name: 'attraccess_users_per_locale',
      help: 'Number of users with each locale set',
      labelNames: ['locale'],
      registers: [this.registry],
    });

    this.resourcesTotal = new Gauge({
      name: 'attraccess_resources_total',
      help: 'Total number of resources',
      registers: [this.registry],
    });

    this.resourceUsageSessionsActive = new Gauge({
      name: 'attraccess_resource_usage_sessions_active',
      help: 'Number of active resource usage sessions',
      registers: [this.registry],
    });

    this.resourceUsageSessionsTotal = new Counter({
      name: 'attraccess_resource_usage_sessions_total',
      help: 'Total number of resource usage sessions',
      labelNames: ['action'],
      registers: [this.registry],
    });

    this.resourceUsageDurationSeconds = new Histogram({
      name: 'attraccess_resource_usage_duration_seconds',
      help: 'Duration of resource usage sessions in seconds',
      buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
      registers: [this.registry],
    });

    this.resourceGroupsTotal = new Gauge({
      name: 'attraccess_resource_groups_total',
      help: 'Total number of resource groups',
      registers: [this.registry],
    });

    this.resourceIntroductionsTotal = new Counter({
      name: 'attraccess_resource_introductions_total',
      help: 'Total number of resource introductions completed',
      registers: [this.registry],
    });

    this.resourceMaintenanceTotal = new Counter({
      name: 'attraccess_resource_maintenance_total',
      help: 'Total number of maintenance events',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.resourceMaintenanceOverdue = new Gauge({
      name: 'attraccess_resource_maintenance_overdue',
      help: 'Number of resources with overdue maintenance',
      registers: [this.registry],
    });

    this.attractapDevicesConnected = new Gauge({
      name: 'attraccess_attractap_devices_connected',
      help: 'Number of connected Attractap devices',
      registers: [this.registry],
    });

    this.attractapReaderConnected = new Gauge({
      name: 'attraccess_attractap_reader_connected',
      help: 'Connection state per Attractap reader (1 = connected, 0 = disconnected)',
      labelNames: ['reader_id', 'reader_name'],
      registers: [this.registry],
    });

    this.attractapNfcTapsTotal = new Counter({
      name: 'attraccess_attractap_nfc_taps_total',
      help: 'Total number of NFC tap events',
      labelNames: ['reader_id'],
      registers: [this.registry],
    });

    this.attractapFirmwareUpdatesTotal = new Counter({
      name: 'attraccess_attractap_firmware_updates_total',
      help: 'Total number of firmware update events',
      labelNames: ['reader_id'],
      registers: [this.registry],
    });

    this.attractapCrashReportsTotal = new Counter({
      name: 'attraccess_attractap_crash_reports_total',
      help: 'Total number of crash reports received from Attractap readers',
      labelNames: ['reader_id', 'reset_reason'],
      registers: [this.registry],
    });

    this.billingTransactionsTotal = new Counter({
      name: 'attraccess_billing_transactions_total',
      help: 'Total number of billing transactions',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.billingTransactionAmount = new Histogram({
      name: 'attraccess_billing_transaction_amount',
      help: 'Billing transaction amounts in base currency units',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.projectsTotal = new Gauge({
      name: 'attraccess_projects_total',
      help: 'Total number of projects',
      registers: [this.registry],
    });

    this.emailSentTotal = new Counter({
      name: 'attraccess_email_sent_total',
      help: 'Total number of emails sent',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.mqttServersTotal = new Gauge({
      name: 'attraccess_mqtt_servers_total',
      help: 'Total number of configured MQTT servers',
      registers: [this.registry],
    });

    this.mqttServersHealthy = new Gauge({
      name: 'attraccess_mqtt_servers_healthy',
      help: 'Number of healthy MQTT servers',
      registers: [this.registry],
    });

    this.pluginsLoaded = new Gauge({
      name: 'attraccess_plugins_loaded',
      help: 'Number of loaded plugins',
      registers: [this.registry],
    });

    this.companionDownloadsTotal = new Counter({
      name: 'attraccess_companion_downloads_total',
      help: 'Total number of companion app binary download attempts',
      labelNames: ['platform', 'arch', 'status'],
      registers: [this.registry],
    });

  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing gauge metrics from database...');
    const [users, resources, projects, groups, mqttServers, activeUsageSessions, activeAuthSessions, localeCounts] = await Promise.all([
      this.userRepository.count(),
      this.resourceRepository.count(),
      this.projectRepository.count(),
      this.resourceGroupRepository.count(),
      this.mqttServerRepository.count(),
      this.resourceUsageRepository.count({ where: { endTime: IsNull() } }),
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
