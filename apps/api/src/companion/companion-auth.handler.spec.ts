import { Test, TestingModule } from '@nestjs/testing';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionEventType, CompanionSocket } from './companion.types';

function makeSocket(): CompanionSocket {
  return {
    id: 'test',
    deviceId: null,
    sendEvent: jest.fn(),
  } as unknown as CompanionSocket;
}

const mockService = {
  createDevice: jest.fn(),
  findById: jest.fn(),
  verifyToken: jest.fn(),
  touchLastConnection: jest.fn(),
  getLatestVersion: jest.fn(),
};

const mockGatewayService = {
  getResourcesForDevice: jest.fn(),
};

describe('CompanionAuthHandler', () => {
  let handler: CompanionAuthHandler;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanionAuthHandler,
        { provide: CompanionService, useValue: mockService },
        { provide: CompanionGatewayService, useValue: mockGatewayService },
      ],
    }).compile();

    handler = module.get(CompanionAuthHandler);
  });

  describe('new device registration (empty payload)', () => {
    it('creates device and sends COMPANION_REGISTER_RESPONSE', async () => {
      mockService.createDevice.mockResolvedValue({ device: { id: 7 }, token: 'tok123' });

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, {});

      expect(mockService.createDevice).toHaveBeenCalled();
      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_REGISTER_RESPONSE, { id: 7, token: 'tok123' });
      expect(socket.deviceId).toBe(7);
    });
  });

  describe('existing device authentication', () => {
    it('sends COMPANION_AUTHENTICATED on valid credentials', async () => {
      const device = { id: 5, name: 'Lab PC', tokenHash: 'hash' };
      mockService.findById.mockResolvedValue(device);
      mockService.verifyToken.mockResolvedValue(true);
      mockService.touchLastConnection.mockResolvedValue(undefined);
      mockGatewayService.getResourcesForDevice.mockResolvedValue([{ id: 42, name: '3D Printer' }]);
      mockService.getLatestVersion.mockReturnValue(null);

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, { id: 5, token: 'abc', platform: 'linux', appVersion: '1.0.0' });

      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_AUTHENTICATED, {
        id: 5,
        name: 'Lab PC',
        resources: [{ id: 42, name: '3D Printer' }],
      });
      expect(socket.deviceId).toBe(5);
    });

    it('sends COMPANION_UNAUTHORIZED when device not found', async () => {
      mockService.findById.mockResolvedValue(null);

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, { id: 99, token: 'whatever' });

      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
      expect(socket.deviceId).toBeNull();
    });

    it('sends COMPANION_UNAUTHORIZED on invalid token', async () => {
      mockService.findById.mockResolvedValue({ id: 5, tokenHash: 'hash' });
      mockService.verifyToken.mockResolvedValue(false);

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, { id: 5, token: 'wrong' });

      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    });

    it('sends COMPANION_UPDATE_AVAILABLE when version is outdated', async () => {
      mockService.findById.mockResolvedValue({ id: 5, name: 'PC', tokenHash: 'h' });
      mockService.verifyToken.mockResolvedValue(true);
      mockService.touchLastConnection.mockResolvedValue(undefined);
      mockGatewayService.getResourcesForDevice.mockResolvedValue([]);
      mockService.getLatestVersion.mockReturnValue({ version: '2.0.0', downloadUrl: '/download/linux/amd64' });

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, { id: 5, token: 'tok', platform: 'linux', appVersion: '1.0.0' });

      const calls = (socket.sendEvent as jest.Mock).mock.calls;
      const updateCall = calls.find((c) => c[0] === CompanionEventType.COMPANION_UPDATE_AVAILABLE);
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toMatchObject({ version: '2.0.0' });
    });

    it('does not send COMPANION_UPDATE_AVAILABLE when version is current', async () => {
      mockService.findById.mockResolvedValue({ id: 5, name: 'PC', tokenHash: 'h' });
      mockService.verifyToken.mockResolvedValue(true);
      mockService.touchLastConnection.mockResolvedValue(undefined);
      mockGatewayService.getResourcesForDevice.mockResolvedValue([]);
      mockService.getLatestVersion.mockReturnValue({ version: '1.0.0', downloadUrl: '/dl' });

      const socket = makeSocket();
      await handler.handleAuthenticate(socket, { id: 5, token: 'tok', platform: 'linux', appVersion: '1.0.0' });

      const calls = (socket.sendEvent as jest.Mock).mock.calls;
      expect(calls.every((c) => c[0] !== CompanionEventType.COMPANION_UPDATE_AVAILABLE)).toBe(true);
    });
  });
});
