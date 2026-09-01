import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoFlowService } from './wago-flow.service';
import { WagoSettings } from './wago-settings.entity';

describe('WagoFlowService', () => {
  const controller = { id: 1, hardwareId: 'cc100-01', trustState: 'claimed', mqttServerId: 2 } as WagoController;
  const revision = {
    controllerId: 1,
    state: 'applied',
    snapshot: JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['input'] }] }),
  } as WagoConfigurationRevision;

  function createService() {
    const trigger = jest.fn().mockResolvedValue(undefined);
    const controllerRepository = { find: jest.fn().mockResolvedValue([controller]), findOneBy: jest.fn().mockResolvedValue(controller) };
    const revisionRepository = { find: jest.fn().mockResolvedValue([revision]) };
    const settingsRepository = { findOneBy: jest.fn().mockResolvedValue({ id: 1, defaultMqttServerId: 2, operationalPrefix: 'attraccess/wago' } as WagoSettings) };
    const context = {
      getRepository: jest.fn((entity) => entity === WagoController ? controllerRepository : entity === WagoConfigurationRevision ? revisionRepository : settingsRepository),
      logger: { warn: jest.fn() },
      flows: { trigger },
      mqtt: { subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }) },
    } as unknown as PluginContext;
    return { service: new WagoFlowService(context), trigger, context };
  }

  it('caches a validated retained state and dispatches matching trigger nodes', async () => {
    const { service, trigger } = createService();
    await service['onMessage'](2, 'attraccess/wago', 'attraccess/wago/v1/controllers/cc100-01/state', Buffer.from(JSON.stringify({ sequence: 1, timestamp: '2026-08-30T00:00:00.000Z', connected: true, revision: 1, contentHash: 'hash', outputs: { door: true } })));
    expect(service.read({ controllerId: 1, channelId: 'door' })).toMatchObject({ value: true, sequence: 1 });
    expect(trigger).toHaveBeenCalledWith('plugin.wago.event-received', expect.any(Function), expect.objectContaining({ wago: expect.objectContaining({ channelId: 'door', value: true }) }));
  });

  it('ignores duplicate sequences and resolves waiters from later state', async () => {
    const { service, trigger } = createService();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, value: boolean) => Buffer.from(JSON.stringify({ sequence, timestamp: '2026-08-30T00:00:00.000Z', connected: true, revision: 1, contentHash: 'hash', outputs: { door: value } }));
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, false));
    const waiting = service.wait({ controllerId: 1, channelId: 'door', equals: true, timeoutMs: 100 });
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, true));
    await service['onMessage'](2, 'attraccess/wago', topic, event(2, true));
    await expect(waiting).resolves.toMatchObject({ value: true, sequence: 2 });
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('isolates messages from another MQTT server and accepts a newer controller restart', async () => {
    const { service } = createService();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, timestamp: string, value: boolean) => Buffer.from(JSON.stringify({ sequence, timestamp, connected: true, revision: 1, contentHash: 'hash', outputs: { door: value } }));
    await service['onMessage'](3, 'attraccess/wago', topic, event(1, '2026-08-30T00:00:00.000Z', true));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toBeNull();
    await service['onMessage'](2, 'attraccess/wago', topic, event(10, '2026-08-30T00:00:00.000Z', false));
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, '2026-08-30T00:01:00.000Z', true));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toMatchObject({ sequence: 1, value: true });
  });

  it('uses source timestamps for stale state and returns node-specific schemas', async () => {
    const { service } = createService();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    await service['onMessage'](2, 'attraccess/wago', topic, Buffer.from(JSON.stringify({ sequence: 1, timestamp: new Date(Date.now() - 90_001).toISOString(), connected: true, revision: 1, contentHash: 'hash', outputs: { door: true } })));
    const state = service.read({ controllerId: 1, channelId: 'door', category: 'state' });
    expect(state && service.payload(state)).toMatchObject({ stale: true });
    const eventSchema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door' }, 'event');
    const waitSchema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door', category: 'state' }, 'wait');
    expect(eventSchema).toMatchObject({ required: ['controllerId', 'channelId', 'category'], properties: { minimumIntervalMs: expect.any(Object) } });
    expect(waitSchema).toMatchObject({ properties: { equals: { type: 'boolean' }, timeoutMs: expect.any(Object) } });
  });
});
