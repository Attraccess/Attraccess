import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { CompanionController, RenameCompanionDeviceDto } from './companion.controller';
import { CompanionService } from './companion.service';
import type { CompanionGateway } from './companion.gateway';
import { CompanionGatewayService } from './companion-gateway.service';
import { FakeCompanionDeviceStore } from './fake-companion-device.store';

describe('CompanionController device endpoints', () => {
  let store: FakeCompanionDeviceStore;
  let controller: CompanionController;
  let gatewayService: {
    sockets: Map<string, { deviceId: number }>;
    sendDeviceRenamed: jest.Mock;
    getResourcesForDevice: jest.Mock;
  };
  let gateway: { disconnectDevice: jest.Mock };
  // Machine list visibility (ATT-843): machine 2 is hidden from the caller.
  const listVisibility = {
    filterVisible: jest.fn(async (_user: unknown, ids: number[]) => ids.filter((id) => id !== 2)),
  };

  beforeEach(() => {
    store = new FakeCompanionDeviceStore();
    // The manifest is irrelevant here; the service only needs the store.
    const service = new CompanionService(store);
    gatewayService = { sockets: new Map(), sendDeviceRenamed: jest.fn(), getResourcesForDevice: jest.fn() };
    gateway = { disconnectDevice: jest.fn() };
    controller = new CompanionController(
      service,
      gateway as unknown as CompanionGateway,
      gatewayService as unknown as CompanionGatewayService,
      listVisibility as never,
    );
  });

  it('keeps the name through the global whitelisting pipe and rejects a missing or empty name', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const meta = { type: 'body' as const, metatype: RenameCompanionDeviceDto };

    await expect(pipe.transform({ name: 'Desk PC' }, meta)).resolves.toMatchObject({ name: 'Desk PC' });
    await expect(pipe.transform({}, meta)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ name: '' }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never returns the token hash when listing, reading or renaming', async () => {
    const device = await store.registerDevice({ name: 'abcd', tokenHash: 'secret-hash' });
    gatewayService.sockets.set('s', { deviceId: device.id });

    const listed = await controller.list();
    const one = await controller.getOne(device.id);
    const renamed = await controller.rename(device.id, { name: 'Desk PC' });

    expect(JSON.stringify([listed, one, renamed])).not.toContain('secret-hash');
    expect(one).toMatchObject({ id: device.id, connected: true, locked: false });
    expect(renamed.name).toBe('Desk PC');
    expect(gatewayService.sendDeviceRenamed).toHaveBeenCalledWith(device.id, 'Desk PC');
  });

  it('reports 404 for unknown devices and disconnects before deleting', async () => {
    await expect(controller.getOne(7)).rejects.toThrow(NotFoundException);
    const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
    await controller.remove(device.id);
    expect(gateway.disconnectDevice).toHaveBeenCalledWith(device.id);
    expect(await store.findDevice(device.id)).toBeNull();
  });

  it('lists only the machines of a device that the caller may see (ATT-843)', async () => {
    const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
    gatewayService.getResourcesForDevice.mockResolvedValueOnce([
      { id: 1, name: 'Laser' },
      { id: 2, name: 'Hidden lathe' },
    ]);
    await expect(controller.getResources(device.id, { user: { id: 5 } } as never)).resolves.toEqual([
      { id: 1, name: 'Laser' },
    ]);
  });
});
