import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, PluginContext, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { firstValueFrom, of } from 'rxjs';
import type { DeviceRegistryService } from '../devices/registry/service';
import { ShellyLiveUpdatesService } from './live-updates.service';
import type { ShellyFirmwareService } from './service.service';

function setup(devices: Record<number, { ipAddress: string; generation: number | null }> = {}) {
  let topic: PluginLiveTopic | undefined;
  const context = {
    liveUpdates: {
      register: jest.fn((definition: PluginLiveTopic) => {
        topic = definition;
        return () => undefined;
      }),
    },
  } as unknown as PluginContext;
  const registry = {
    findById: jest.fn(async (id: number) => devices[id] ?? null),
  } as unknown as DeviceRegistryService;
  const firmware = {
    observe: jest.fn((_id: number, resolve: () => Promise<unknown>) => of({ data: { resolve } })),
  } as unknown as ShellyFirmwareService;
  new ShellyLiveUpdatesService(context, registry, firmware).onModuleInit();
  if (!topic) throw new Error('firmware topic was not registered');
  return { topic, registry, firmware };
}

const user = (permissions: string[] = ['resources.update']) =>
  ({ id: 1, effectivePermissions: new Set(permissions) }) as unknown as AuthenticatedUser;

describe('ShellyLiveUpdatesService', () => {
  it('refuses to start on hosts without plugin live-update support', () => {
    const service = new ShellyLiveUpdatesService(
      {} as PluginContext,
      {} as DeviceRegistryService,
      {} as ShellyFirmwareService,
    );
    expect(() => service.onModuleInit()).toThrow('Shelly live updates require a host with plugin live-update support');
  });

  it('registers a firmware topic that requires a device identifier', () => {
    const { topic } = setup();
    expect(topic).toMatchObject({ topic: 'firmware', identifier: 'required' });
  });

  describe('authorize', () => {
    it('allows resource managers to follow a registered device', async () => {
      const { topic, registry } = setup({ 7: { ipAddress: '192.0.2.7', generation: 2 } });
      await expect(topic.authorize({ topic: 'firmware', identifier: '7' }, user())).resolves.toBeUndefined();
      expect(registry.findById).toHaveBeenCalledWith(7);
    });

    it.each([
      ['without effective permissions', { id: 1 } as unknown as AuthenticatedUser],
      ['without resources.update', user(['resources.read'])],
    ])('forbids users %s', async (_label, subscriber) => {
      const { topic, registry } = setup({ 7: { ipAddress: '192.0.2.7', generation: 2 } });
      await expect(topic.authorize({ topic: 'firmware', identifier: '7' }, subscriber)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(registry.findById).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '0', '07', '-1', '1.5', 'abc', '9007199254740993'])(
      'rejects the malformed identifier %p without a registry lookup',
      async (identifier) => {
        const { topic, registry } = setup();
        await expect(topic.authorize({ topic: 'firmware', identifier }, user())).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(registry.findById).not.toHaveBeenCalled();
      },
    );

    it('rejects identifiers of unknown devices', async () => {
      const { topic, registry } = setup();
      await expect(topic.authorize({ topic: 'firmware', identifier: '8' }, user())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(registry.findById).toHaveBeenCalledWith(8);
    });
  });

  describe('source', () => {
    async function resolveTarget(devices: Parameters<typeof setup>[0], identifier: string) {
      const { topic, firmware } = setup(devices);
      const event = (await firstValueFrom(topic.source({ topic: 'firmware', identifier }, user()))) as {
        data: { resolve: () => Promise<unknown> };
      };
      expect(firmware.observe).toHaveBeenCalledWith(Number(identifier), expect.any(Function));
      return event.data.resolve();
    }

    it('observes firmware using the registered device address and generation', async () => {
      await expect(resolveTarget({ 7: { ipAddress: '192.0.2.7', generation: 2 } }, '7')).resolves.toEqual({
        ipAddress: '192.0.2.7',
        generation: 2,
      });
    });

    it.each([
      ['has been removed', {}],
      ['has no known generation', { 7: { ipAddress: '192.0.2.7', generation: null } }],
    ])('fails target resolution when the device %s', async (_label, devices) => {
      await expect(resolveTarget(devices, '7')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
