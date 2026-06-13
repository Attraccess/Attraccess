import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { User, Resource, Project, ResourceGroup, MqttServer, ResourceUsage, Session } from '@attraccess/database-entities';

describe('MetricsService', () => {
  let service: MetricsService;

  const mockUserRepo = { count: jest.fn().mockResolvedValue(10) };
  const mockResourceRepo = { count: jest.fn().mockResolvedValue(5) };
  const mockProjectRepo = { count: jest.fn().mockResolvedValue(3) };
  const mockResourceGroupRepo = { count: jest.fn().mockResolvedValue(2) };
  const mockMqttServerRepo = { count: jest.fn().mockResolvedValue(1) };
  const mockResourceUsageRepo = { count: jest.fn().mockResolvedValue(4) };
  const mockSessionRepo = { count: jest.fn().mockResolvedValue(7) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Resource), useValue: mockResourceRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getRepositoryToken(ResourceGroup), useValue: mockResourceGroupRepo },
        { provide: getRepositoryToken(MqttServer), useValue: mockMqttServerRepo },
        { provide: getRepositoryToken(ResourceUsage), useValue: mockResourceUsageRepo },
        { provide: getRepositoryToken(Session), useValue: mockSessionRepo },
      ],
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

    it('queries active sessions (non-expired) for authActiveSessions', async () => {
      await service.onModuleInit();

      expect(mockSessionRepo.count).toHaveBeenCalledWith({
        where: { expiresAt: expect.anything() },
      });
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
      expect(metrics).toContain('attraccess_auth_sso_login_failures_total{provider_type="oidc",reason="invalid_assertion"} 1');
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
});
