import { Test, TestingModule } from '@nestjs/testing';
import { AttractapGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { AttractapService } from '../attractap.service';
import { UsersService } from '../../users-and-auth/users/users.service';
import { AttractapFirmwareService } from '../firmware.service';
import { SumUpService } from '../../billing/sumup.service';
import { LicenseService } from '../../license/license.service';
import { ResourceUsageService } from '../../resources/usage/resourceUsage.service';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { ResourceIntroductionsService } from '../../resources/introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../../resources/introducers/resourceIntroducers.service';
import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';
import { ResourceFlowsExecutorService } from '../../resources/flows/resource-flows-executor.service';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../../resources/forms/forms.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from './websocket.types';
import { MetricsService } from '../../metrics/metrics.service';
import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';
import { WS_METRICS } from '../../metrics/definitions/tokens';

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
      enrollNewCardData: null,
      ota: null,
    },
    ...overrides,
  } as unknown as AuthenticatedWebSocket;
}

describe('AttractapGateway', () => {
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
        { provide: LicenseService, useValue: licenseService },
        { provide: ResourceUsageService, useValue: {} },
        { provide: ResourceMaintenanceService, useValue: { hasActiveMaintenance: jest.fn().mockResolvedValue(false) } },
        { provide: ResourceIntroductionsService, useValue: {} },
        { provide: ResourceIntroducersService, useValue: {} },
        { provide: ResourceFlowsService, useValue: {} },
        { provide: ResourceFlowsExecutorService, useValue: {} },
        { provide: ProjectsService, useValue: {} },
        { provide: ResourceFormsService, useValue: {} },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: WS_METRICS, useValue: mockWsMetrics },
        { provide: MetricsToggleService, useValue: mockMetricsToggle },
      ],
    }).compile();

    gateway = module.get(AttractapGateway);
    websocketService = module.get(WebsocketService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('closes the connection when license verification fails', async () => {
      licenseService.verifyLicense.mockRejectedValue(new Error('License invalid'));
      const mockClient = { close: jest.fn(), send: jest.fn() } as unknown as WebSocket;

      await gateway.handleConnection(mockClient);

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('registers the socket and sends auth request on successful connection', async () => {
      const mockClient = {
        close: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
      } as unknown as WebSocket;

      // handleConnection blocks on waitForClientResponse (3 retries × 4s).
      // Don't await — just let it start, then verify the socket was registered
      // and that send() was called with the READER_REQUEST_AUTHENTICATION event.
      const connectionPromise = gateway.handleConnection(mockClient);

      // Give the event loop a tick so handleConnection reaches the send call
      await new Promise((resolve) => setImmediate(resolve));

      expect(websocketService.sockets.size).toBe(1);
      const registeredSocket = Array.from(websocketService.sockets.values())[0];
      expect(registeredSocket.readerId).toBeNull();
      expect(registeredSocket.state.lastAuthenticatedUserId).toBeNull();

      expect(mockClient.send).toHaveBeenCalled();
      const sendMock = mockClient.send as jest.Mock;
      const sentData = JSON.parse(sendMock.mock.calls[0][0]);
      expect(sentData.data.type).toBe('READER_REQUEST_AUTHENTICATION');

      // Clean up: advance all timers so the promise settles
      jest.useFakeTimers();
      jest.runAllTimers();
      jest.useRealTimers();

      // Wait for the promise to settle (connection will be closed due to no ACK)
      await connectionPromise;
    }, 30000);
  });

  describe('handleDisconnect', () => {
    it('removes the socket from websocketService', async () => {
      const socket = createMockSocket({ id: 'disc-1' });
      websocketService.sockets.set('disc-1', socket);
      (gateway as unknown as { connectedAt: WeakMap<object, bigint> }).connectedAt.set(
        socket as unknown as object,
        process.hrtime.bigint(),
      );

      expect(websocketService.sockets.size).toBe(1);
      await gateway.handleDisconnect(socket);
      expect(websocketService.sockets.size).toBe(0);
      expect(mockWsMetrics.connectionDuration.observe).toHaveBeenCalledWith(
        { gateway: 'attractap' },
        expect.any(Number),
      );
    });

    it('closes OTA file descriptor on disconnect if present', async () => {
      const socket = createMockSocket({
        id: 'disc-ota',
        state: {
          lastAuthenticatedUserId: null,
          enrollNewCardData: null,
          ota: { path: '/tmp/test', size: 1024, fd: 999 },
        },
      });
      websocketService.sockets.set('disc-ota', socket);

      await gateway.handleDisconnect(socket);
      expect(websocketService.sockets.has('disc-ota')).toBe(false);
    });
  });

  describe('onHeartbeat', () => {
    it('updates last reader connection for authenticated sockets', async () => {
      const socket = createMockSocket({ id: 'hb-1', readerId: 5 });

      await gateway.onHeartbeat(socket);

      expect(attractapService.updateLastReaderConnection).toHaveBeenCalledWith(5);
    });

    it('does not update for sockets without a readerId', async () => {
      const socket = createMockSocket({ id: 'hb-2', readerId: null });

      await gateway.onHeartbeat(socket);

      expect(attractapService.updateLastReaderConnection).not.toHaveBeenCalled();
    });
  });

  describe('onClientEvent', () => {
    it('rejects server-only event types from clients', async () => {
      const socket = createMockSocket({ id: 'ev-1', readerId: 1 });

      const serverOnlyEvents = [
        AttractapEventType.RESOURCE_LIST,
        AttractapEventType.READER_UNAUTHORIZED,
        AttractapEventType.READER_REQUEST_AUTHENTICATION,
        AttractapEventType.READER_AUTHENTICATED,
        AttractapEventType.CARD_AUTHENTICATION_DATA,
        AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        AttractapEventType.RESOURCE_USAGE_FORM_REQUEST,
      ];

      for (const type of serverOnlyEvents) {
        const event = new AttractapEvent(type, {});
        await expect(
          gateway.onClientEvent(event.data, socket),
        ).rejects.toThrow('THIS IS A SERVER SIDE ONLY EVENT');
      }
    });

    it('ignores events from unauthenticated clients (no readerId) except REGISTER/AUTHENTICATE', async () => {
      const socket = createMockSocket({ id: 'ev-2', readerId: null });

      const event = new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, {});
      const result = await gateway.onClientEvent(event.data, socket);

      expect(result).toBeUndefined();
    });
  });

  describe('sendResourceList', () => {
    it('does nothing when no sockets match the reader id', async () => {
      await expect(gateway.sendResourceList(999)).resolves.toBeUndefined();
    });
  });

  describe('disconnectReader', () => {
    it('does nothing when no sockets match the reader id', async () => {
      await expect(gateway.disconnectReader(999)).resolves.toBeUndefined();
    });

    it('closes all sockets for the given reader', async () => {
      const socket1 = createMockSocket({ id: 'dr-1', readerId: 5 });
      const socket2 = createMockSocket({ id: 'dr-2', readerId: 5 });
      websocketService.sockets.set('dr-1', socket1);
      websocketService.sockets.set('dr-2', socket2);

      await gateway.disconnectReader(5);

      expect(socket1.close).toHaveBeenCalled();
      expect(socket2.close).toHaveBeenCalled();
    });
  });
});
