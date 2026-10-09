/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceListService } from './resource-list.service';

export function registerResourceListServiceFixture() {
  let service: ResourceListService;

  let websocketService: { sockets: Map<string, any> };

  let attractapService: { findReaderById: jest.Mock };

  let resourceUsageService: { getActiveSessions: jest.Mock; canControllResource: jest.Mock };

  let resourceMaintenanceService: {
    getActiveMaintenanceResourceIds: jest.Mock;
    getMaintenanceManagedResourceIds: jest.Mock;
  };

  let resourceHealthService: { listForResources: jest.Mock };

  let resourceFlowsService: { getNodesForResources: jest.Mock };

  let resourceIntroducersService: { getManyForResources: jest.Mock };

  function createMockSocket(overrides: Partial<any> = {}): any {
    return {
      id: 'socket-1',
      readerId: 42,
      state: { lastAuthenticatedUserId: null },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
      ...overrides,
    };
  }

  function createReaderFixture(overrides: Partial<any> = {}): any {
    return {
      id: 42,
      name: 'Front Door Reader',
      ledBrightness: 128,
      resources: [
        {
          id: 10,
          name: '3D Printer',
          type: 'machine',
          separateUnlockAndUnlatch: true,
          description: 'A printer',
          allowTakeOver: false,
          introducers: [{ user: { username: 'introducer-a' } }],
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    service = Object.create(ResourceListService.prototype);

    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    (service as any).pendingSends = new Map();
    (service as any).resourceListRevision = 0;

    websocketService = { sockets: new Map() };
    attractapService = { findReaderById: jest.fn() };
    resourceUsageService = {
      canControllResource: jest.fn().mockResolvedValue(false),
      getActiveSessions: jest.fn().mockResolvedValue(new Map([[10, null]])),
    };
    resourceMaintenanceService = {
      getActiveMaintenanceResourceIds: jest.fn().mockResolvedValue(new Set()),
      getMaintenanceManagedResourceIds: jest.fn().mockResolvedValue(new Set()),
    };
    resourceHealthService = { listForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };
    resourceFlowsService = { getNodesForResources: jest.fn().mockResolvedValue(new Map([[10, []]])) };
    resourceIntroducersService = {
      getManyForResources: jest.fn().mockResolvedValue(new Map([[10, [{ user: { username: 'introducer-a' } }]]])),
    };

    (service as any).usersService = { findOne: jest.fn(async ({ id }) => ({ id, username: `user-${id}` })) };
    (service as any).rbacService = { getEffectivePermissions: jest.fn().mockResolvedValue(new Set()) };
    (service as any).websocketService = websocketService;
    (service as any).attractapService = attractapService;
    (service as any).resourceUsageService = resourceUsageService;
    (service as any).resourceMaintenanceService = resourceMaintenanceService;
    (service as any).resourceHealthService = resourceHealthService;
    (service as any).resourceFlowsService = resourceFlowsService;
    (service as any).resourceIntroducersService = resourceIntroducersService;
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  return {
    get service() {
      return service;
    },
    get websocketService() {
      return websocketService;
    },
    get attractapService() {
      return attractapService;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    get resourceMaintenanceService() {
      return resourceMaintenanceService;
    },
    get resourceHealthService() {
      return resourceHealthService;
    },
    get resourceFlowsService() {
      return resourceFlowsService;
    },
    get resourceIntroducersService() {
      return resourceIntroducersService;
    },
    get createMockSocket() {
      return createMockSocket;
    },
    get createReaderFixture() {
      return createReaderFixture;
    },
  };
}
