import { MetricsPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
describe('MetricsService', () => {
  let service: MetricsService;

  const snapshot = {
    users: 10,
    resources: 5,
    projects: 3,
    groups: 2,
    mqttServers: 1,
    activeUsageSessions: 4,
    activeAuthSessions: 7,
    localeCounts: [{ locale: 'en', count: 10 }],
  };
  const persistence: jest.Mocked<MetricsPersistence> = { snapshot: jest.fn().mockResolvedValue(snapshot) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService, { provide: MetricsPersistence, useValue: persistence }],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('metric naming (issue #9: attraccess_ prefix)', () => {
    it('all custom metrics use attraccess_ prefix', async () => {
      const metricsOutput = await service.getMetrics();
      const customMetricLines = metricsOutput
        .split('\n')
        .filter((l) => l.startsWith('# HELP') && !l.includes('nodejs_') && !l.includes('process_'));

      for (const line of customMetricLines) {
        const metricName = line.replace('# HELP ', '').split(' ')[0];
        expect(metricName).toMatch(/^attraccess_/);
      }
    });
  });

  describe('metric help text (issue #10: billing histogram)', () => {
    it('billingTransactionAmount help mentions base currency units', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('Billing transaction amounts in base currency units');
    });
  });

  describe('onModuleInit — gauge initialization from database', () => {
    it('initializes gauges from database counts', async () => {
      await service.onModuleInit();

      const metricsOutput = await service.getMetrics();
      expect(metricsOutput).toContain('attraccess_users_total 10');
      expect(metricsOutput).toContain('attraccess_resources_total 5');
      expect(metricsOutput).toContain('attraccess_projects_total 3');
      expect(metricsOutput).toContain('attraccess_resource_groups_total 2');
      expect(metricsOutput).toContain('attraccess_mqtt_servers_total 1');
      expect(metricsOutput).toContain('attraccess_resource_usage_sessions_active 4');
      expect(metricsOutput).toContain('attraccess_auth_active_sessions 7');
    });

    it('requests a snapshot at the current time', async () => {
      await service.onModuleInit();

      expect(persistence.snapshot).toHaveBeenCalledWith(expect.any(Date));
    });

    it('seeds usersPerLocale gauge from normalized locale counts', async () => {
      persistence.snapshot.mockResolvedValueOnce({
        ...snapshot,
        localeCounts: [
          { locale: 'en', count: 8 },
          { locale: 'de-DE', count: 2 },
        ],
      });
      await service.onModuleInit();

      const metricsOutput = await service.getMetrics();
      expect(metricsOutput).toContain('attraccess_users_per_locale{locale="en"} 8');
      expect(metricsOutput).toContain('attraccess_users_per_locale{locale="de-DE"} 2');
    });
  });

  describe('getMetrics', () => {
    it('returns a string containing prometheus-formatted metrics', async () => {
      const metrics = await service.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('attraccess_users_total');
    });
  });

  describe('getContentType', () => {
    it('returns a valid prometheus content type', () => {
      const contentType = service.getContentType();
      expect(contentType).toContain('text/');
    });
  });

  describe('previously unused metrics are now declared (issue #6)', () => {
    it('pluginsLoaded gauge is defined', () => {
      expect(service.pluginsLoaded).toBeDefined();
    });

    it('authActiveSessions gauge is defined', () => {
      expect(service.authActiveSessions).toBeDefined();
    });

    it('auth2faUsageTotal counter is defined', () => {
      expect(service.auth2faUsageTotal).toBeDefined();
    });

    it('authSsoLoginFailuresTotal counter is defined with provider type and reason labels', async () => {
      service.authSsoLoginFailuresTotal.inc({ provider_type: 'oidc', reason: 'invalid_assertion' });

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'attraccess_auth_sso_login_failures_total{provider_type="oidc",reason="invalid_assertion"} 1',
      );
    });

    it('attractapFirmwareUpdatesTotal counter is defined', () => {
      expect(service.attractapFirmwareUpdatesTotal).toBeDefined();
    });

    it('mqttServersHealthy gauge is defined', () => {
      expect(service.mqttServersHealthy).toBeDefined();
    });
  });

  describe('removed duplicate metric (issue #8)', () => {
    it('does not expose a websocketConnectionsActive metric', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).not.toContain('websocket_connections_active');
    });
  });

  describe('companion download metrics (ATT-614)', () => {
    it('companionDownloadsTotal counter is defined', () => {
      expect(service.companionDownloadsTotal).toBeDefined();
    });

    it('companionDownloadsTotal appears in prometheus output with platform/arch/status labels', async () => {
      service.companionDownloadsTotal.inc({ platform: 'linux', arch: 'x64', status: 'success' });
      service.companionDownloadsTotal.inc({ platform: 'linux', arch: 'x64', status: 'not_found' });

      const metrics = await service.getMetrics();
      expect(metrics).toContain('attraccess_companion_downloads_total{platform="linux",arch="x64",status="success"} 1');
      expect(metrics).toContain(
        'attraccess_companion_downloads_total{platform="linux",arch="x64",status="not_found"} 1',
      );
    });

    it('uses attraccess_ prefix (consistent with naming convention)', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('attraccess_companion_downloads_total');
    });
  });
});
