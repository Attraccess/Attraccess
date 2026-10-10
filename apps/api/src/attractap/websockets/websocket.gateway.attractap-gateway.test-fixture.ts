import { Resource } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../../audit/audit.service';
import { SettingsService } from '../../settings/settings.service';

import { BillingService } from '../../billing/charges/billing.service';
import { SumUpService } from '../../billing/sumup/sumup.service';
import { LicenseService } from '../../license/license.service';
import { WS_METRICS } from '../../metrics/definitions/tokens';
import { MetricsService } from '../../metrics/metrics.service';
import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFlowsExecutorService } from '../../resources/flows/execution/resource-flows-executor.service';
import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';
import { ResourceFormsService } from '../../resources/forms/forms.service';
import { ResourceHealthService } from '../../resources/health/resource-health.service';
import { ResourceIntroducersService } from '../../resources/introducers/resourceIntroducers.service';
import { ResourceIntroductionsService } from '../../resources/introductions/resouceIntroductions.service';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { ResourceMeteringService } from '../../resources/metering/resource-metering.service';
import { ResourceOperatingAttributionService } from '../../resources/operating-intervals/resource-operating-attribution.service';
import { SupervisionService } from '../../resources/supervision/supervision.service';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { UsersService } from '../../users-and-auth/users/users.service';
import { AttractapService } from '../attractap.service';
import { AttractapFirmwareService } from '../firmware.service';
import { AttractapAuthHandler } from './handlers/auth/auth.handler';
import { AttractapBillingHandler } from './handlers/billing/billing.handler';
import { AttractapCardHandler } from './handlers/card/card.handler';
import { AttractapCrashReportHandler } from './handlers/crash-report/crash-report.handler';
import { AttractapFirmwareHandler } from './handlers/firmware/firmware.handler';
import { AttractapFormsHandler } from './handlers/forms/forms.handler';
import { AttractapProjectsHandler } from './handlers/projects/projects.handler';
import { ResourceActionGuard } from './handlers/resource-action.guard';
import { ResourceListService } from './handlers/resource-list/resource-list.service';
import { AttractapSessionHandler } from './handlers/session/session.handler';
import { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';
import { AttractapGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { AuthenticatedWebSocket } from './websocket.types';

const mockMetricsService = {
  attractapDevicesConnected: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  attractapNfcTapsTotal: { inc: jest.fn() },
  attractapFirmwareUpdatesTotal: { inc: jest.fn() },
};

const mockWsMetrics = {
  messageDuration: { observe: jest.fn() },
  messagesTotal: { inc: jest.fn() },
  connectionDuration: { observe: jest.fn() },
};

const mockMetricsToggle = { isEnabledCached: jest.fn().mockReturnValue(true) };

function createMockSocket(overrides: Partial<AuthenticatedWebSocket> = {}): AuthenticatedWebSocket {
  return {
    id: 'test-id',
    readerId: null,
    messageCount: 0,
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendBinaryData: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    state: {
      lastAuthenticatedUserId: null,
      enrollment: null,
      enrollNewCardData: null,
      resetNfcCardData: null,
      ota: null,
    },
    ...overrides,
  } as unknown as AuthenticatedWebSocket;
}
export function registerAttractapGatewayFixture() {
  let gateway: AttractapGateway;

  let websocketService: WebsocketService;

  let licenseService: { verifyLicense: jest.Mock };
  let attractapService: { updateLastReaderConnection: jest.Mock; findReaderById: jest.Mock };

  beforeEach(async () => {
    licenseService = {
      verifyLicense: jest.fn().mockResolvedValue(undefined),
    };

    attractapService = {
      updateLastReaderConnection: jest.fn().mockResolvedValue(undefined),
      findReaderById: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttractapGateway,
        WebsocketService,
        { provide: AttractapService, useValue: attractapService },
        { provide: UsersService, useValue: {} },
        { provide: AttractapFirmwareService, useValue: {} },
        { provide: SumUpService, useValue: {} },
        { provide: BillingService, useValue: { getResourceUsageCharge: jest.fn().mockResolvedValue(null) } },
        { provide: LicenseService, useValue: licenseService },
        { provide: ResourceUsageService, useValue: {} },
        { provide: ResourceMaintenanceService, useValue: { hasActiveMaintenance: jest.fn().mockResolvedValue(false) } },
        { provide: ResourceHealthService, useValue: { listForResource: jest.fn().mockResolvedValue([]) } },
        { provide: ResourceIntroductionsService, useValue: {} },
        { provide: ResourceIntroducersService, useValue: {} },
        { provide: ResourceFlowsService, useValue: {} },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: ProjectsService, useValue: {} },
        { provide: ResourceFormsService, useValue: {} },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: WS_METRICS, useValue: mockWsMetrics },
        { provide: MetricsToggleService, useValue: mockMetricsToggle },
        { provide: SupervisionService, useValue: {} },
        { provide: RbacService, useValue: {} },
        { provide: AuditService, useValue: { recordAttractap: jest.fn().mockResolvedValue(undefined) } },
        { provide: SettingsService, useValue: { getDefaultLanguage: jest.fn().mockResolvedValue('de') } },
        { provide: getRepositoryToken(Resource), useValue: {} },
        ResourceListService,
        ResourceActionGuard,
        AttractapAuthHandler,
        AttractapFirmwareHandler,
        AttractapCrashReportHandler,
        AttractapCardHandler,
        AttractapFormsHandler,
        AttractapSessionHandler,
        { provide: ResourceMeteringService, useValue: { getLive: jest.fn() } },
        { provide: ResourceOperatingAttributionService, useValue: { getForResource: jest.fn() } },
        AttractapBillingHandler,
        AttractapProjectsHandler,
        AttractapSupervisionHandler,
      ],
    }).compile();

    gateway = module.get(AttractapGateway);
    websocketService = module.get(WebsocketService);
  });
  return {
    get mockWsMetrics() {
      return mockWsMetrics;
    },
    get createMockSocket() {
      return createMockSocket;
    },
    get gateway() {
      return gateway;
    },
    get websocketService() {
      return websocketService;
    },
    get licenseService() {
      return licenseService;
    },
    get attractapService() {
      return attractapService;
    },
  };
}
