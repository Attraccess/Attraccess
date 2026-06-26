import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { CompanionEventType, CompanionSocket } from './companion.types';
import { CompanionService } from './companion.service';

function makeSocket(deviceId: number | null, overrides: Partial<CompanionSocket> = {}): CompanionSocket {
  return {
    id: `sock-${deviceId ?? 'x'}`,
    deviceId,
    platform: null,
    sendEvent: jest.fn(),
    ...overrides,
  } as unknown as CompanionSocket;
}

const mockDeviceRepo = { findOne: jest.fn(), update: jest.fn() };
const mockFlowNodeRepo = {
  createQueryBuilder: jest.fn().mockReturnValue({
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  }),
};

describe('CompanionGatewayService', () => {
  let service: CompanionGatewayService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanionGatewayService,
        { provide: getRepositoryToken(CompanionDevice), useValue: mockDeviceRepo },
        { provide: getRepositoryToken(ResourceFlowNode), useValue: mockFlowNodeRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CompanionService, useValue: { getManifest: jest.fn().mockReturnValue(null) } },
      ],
    }).compile();

    service = module.get(CompanionGatewayService);
  });

  describe('sendLockCommand', () => {
    it('returns true and calls sendEvent on connected device', async () => {
      const socket = makeSocket(3);
      service.sockets.set(socket.id, socket);

      const result = await service.sendLockCommand(3);

      expect(result).toBe(true);
      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_LOCK_PC, {});
    });

    it('persists locked=true even when device not connected', async () => {
      const result = await service.sendLockCommand(999);

      expect(result).toBe(false);
      expect(mockDeviceRepo.update).toHaveBeenCalledWith(999, { locked: true });
    });
  });

  describe('sendUnlockCommand', () => {
    it('returns true and calls sendEvent on connected device', async () => {
      const socket = makeSocket(4);
      service.sockets.set(socket.id, socket);

      const result = await service.sendUnlockCommand(4);

      expect(result).toBe(true);
      expect(socket.sendEvent).toHaveBeenCalledWith(CompanionEventType.COMPANION_UNLOCK_PC, {});
    });

    it('persists locked=false even when device not connected', async () => {
      const result = await service.sendUnlockCommand(999);

      expect(result).toBe(false);
      expect(mockDeviceRepo.update).toHaveBeenCalledWith(999, { locked: false });
    });
  });

  describe('getConnectedDevices', () => {
    it('returns unique deviceIds from live sockets', () => {
      service.sockets.set('a', makeSocket(1));
      service.sockets.set('b', makeSocket(2));
      service.sockets.set('c', makeSocket(1)); // duplicate

      const devices = service.getConnectedDevices();
      const ids = devices.map((d) => d.id).sort();
      expect(ids).toEqual([1, 2]);
    });

    it('excludes sockets with no deviceId', () => {
      service.sockets.set('x', makeSocket(null));
      service.sockets.set('y', makeSocket(5));

      const devices = service.getConnectedDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe(5);
    });
  });

  describe('getResourcesForDevice', () => {
    it('returns deduplicated resources matching deviceId in node data', async () => {
      const mockNodes = [
        { type: 'output.companion.lock-pc', data: { deviceId: 10 }, resource: { id: 42, name: '3D Printer' } },
        { type: 'output.companion.unlock-pc', data: { deviceId: 10 }, resource: { id: 42, name: '3D Printer' } },
        { type: 'output.companion.lock-pc', data: { deviceId: 10 }, resource: { id: 43, name: 'Laser' } },
        { type: 'output.companion.lock-pc', data: { deviceId: 99 }, resource: { id: 44, name: 'Other' } },
      ];

      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockNodes),
      };
      mockFlowNodeRepo.createQueryBuilder.mockReturnValue(qb);

      const resources = await service.getResourcesForDevice(10);
      expect(resources).toHaveLength(2);
      expect(resources.map((r) => r.id).sort()).toEqual([42, 43]);
    });
  });
});
