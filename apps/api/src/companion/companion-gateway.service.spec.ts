import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompanionGatewayService } from './companion-gateway.service';
import { COMPANION_DEVICE_STORE } from './companion-device.port';
import { FakeCompanionDeviceStore } from './fake-companion-device.store';
import { CompanionEventType, CompanionSocket } from './companion.types';

function makeSocket(deviceId: number | null, overrides: Partial<CompanionSocket> = {}): CompanionSocket {
  return {
    id: `sock-${deviceId ?? 'x'}`,
    deviceId,
    platform: null,
    sendEvent: jest.fn(),
    ...overrides,
  } as unknown as CompanionSocket;
}

describe('CompanionGatewayService', () => {
  let service: CompanionGatewayService;
  let store: FakeCompanionDeviceStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new FakeCompanionDeviceStore();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanionGatewayService,
        { provide: COMPANION_DEVICE_STORE, useValue: store },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
      const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
      const result = await service.sendLockCommand(device.id);

      expect(result).toBe(false);
      expect((await store.findDevice(device.id))?.locked).toBe(true);
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
      const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
      await store.setLocked(device.id, true);
      const result = await service.sendUnlockCommand(device.id);

      expect(result).toBe(false);
      expect((await store.findDevice(device.id))?.locked).toBe(false);
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
    it('returns the resources the store reports for the device', async () => {
      store.controlledResources.set(10, [
        { id: 42, name: '3D Printer' },
        { id: 43, name: 'Laser' },
      ]);

      const resources = await service.getResourcesForDevice(10);
      expect(resources.map((r) => r.id)).toEqual([42, 43]);
      expect(await service.getResourcesForDevice(99)).toEqual([]);
    });
  });
});
