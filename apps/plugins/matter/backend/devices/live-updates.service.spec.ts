import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, PluginContext, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { MATTER_OPERATIONS } from '../permissions';
import { ADMIN, createHarness, inventory, node, type Harness } from '../testing/devices-harness.test-utils';
import { LIVE_COALESCE_MS, MatterLiveUpdatesService } from './live-updates.service';
import { MatterLifecycleService } from './lifecycle.service';

const user = (permissions: string[]) =>
  ({ id: 1, effectivePermissions: new Set(permissions) }) as unknown as AuthenticatedUser;
const READ = [...MATTER_OPERATIONS.liveDeviceInventory] as string[];

describe('MatterLiveUpdatesService', () => {
  let h: Harness;
  let topics: Record<string, PluginLiveTopic>;
  let unregister: jest.Mock;
  const bus = () => h.bus;

  beforeEach(async () => {
    h = await createHarness();
    topics = {};
    unregister = jest.fn();
    const context = {
      ...h.context,
      liveUpdates: {
        register: jest.fn((definition: PluginLiveTopic) => {
          topics[definition.topic] = definition;
          return unregister;
        }),
      },
    } as unknown as PluginContext;
    new MatterLiveUpdatesService(context, h.bus, h.lifecycle).onModuleInit();
  });
  afterEach(() => h.close());

  it('registers the devices and device-state topics', () => {
    expect(topics['devices']).toMatchObject({ topic: 'devices', identifier: 'none' });
    expect(topics['device-state']).toMatchObject({ topic: 'device-state', identifier: 'required' });
  });

  it('degrades to polling on a host without live updates instead of failing to start', () => {
    const warn = jest.fn();
    const service = new MatterLiveUpdatesService({ logger: { warn } } as unknown as PluginContext, h.bus, h.lifecycle);
    expect(() => service.onModuleInit()).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('unregisters both topics on shutdown', () => {
    const service = new MatterLiveUpdatesService(
      { liveUpdates: { register: () => unregister } } as unknown as PluginContext,
      h.bus,
      h.lifecycle,
    );
    service.onModuleInit();
    service.onModuleDestroy();
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  describe('authorize', () => {
    it('lets readers follow the inventory and refuses everyone else, on every call', async () => {
      const subscription = { topic: 'devices' };
      expect(() => topics['devices'].authorize(subscription, user(READ))).not.toThrow();
      // A renewal after the permission was revoked is refused again.
      expect(() => topics['devices'].authorize(subscription, user([]))).toThrow(ForbiddenException);
      expect(() => topics['devices'].authorize(subscription, user(['matter.devices.manage']))).toThrow(
        ForbiddenException,
      );
      expect(() => topics['devices'].authorize(subscription, user(['thread.network.read']))).toThrow(
        ForbiddenException,
      );
      expect(() => topics['devices'].authorize(subscription, {} as AuthenticatedUser)).toThrow(ForbiddenException);
    });

    it('lets readers follow an existing endpoint only', async () => {
      await h.reconcile(inventory('1', [node('5')]));
      const endpoint = await h.one('endpoints', { endpointId: 1 });
      const subscribe = (identifier: string | undefined, who = user(READ)) =>
        Promise.resolve(topics['device-state'].authorize({ topic: 'device-state', identifier }, who));

      await expect(subscribe(endpoint.id)).resolves.toBeUndefined();
      await expect(subscribe(endpoint.id, user([]))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(subscribe(undefined)).rejects.toBeInstanceOf(NotFoundException);
      await expect(subscribe('not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
      await expect(subscribe('3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('source', () => {
    it('coalesces a burst of inventory changes into one data-free signal', async () => {
      jest.useFakeTimers();
      try {
        const received: unknown[] = [];
        const subscription = topics['devices'].source({ topic: 'devices' }, user(READ)).subscribe((m) => received.push(m));
        bus().inventoryChanged();
        bus().inventoryChanged();
        bus().stateChanged(['e-1']);
        bus().inventoryChanged();
        expect(received).toEqual([]);
        jest.advanceTimersByTime(LIVE_COALESCE_MS);
        expect(received).toEqual([{ data: { changed: 'inventory' } }]);
        subscription.unsubscribe();
        bus().inventoryChanged();
        jest.advanceTimersByTime(LIVE_COALESCE_MS * 2);
        expect(received).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('signals only the followed endpoint, naming nothing but its own ID', async () => {
      jest.useFakeTimers();
      try {
        const received: unknown[] = [];
        topics['device-state']
          .source({ topic: 'device-state', identifier: 'e-1' }, user(READ))
          .subscribe((m) => received.push(m));
        bus().stateChanged(['e-2']);
        bus().inventoryChanged();
        jest.advanceTimersByTime(LIVE_COALESCE_MS);
        expect(received).toEqual([]);
        bus().stateChanged(['e-1', 'e-2']);
        jest.advanceTimersByTime(LIVE_COALESCE_MS);
        expect(received).toEqual([{ data: { changed: 'state', endpointRef: 'e-1' } }]);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('Change emission', () => {
  let h: Harness;
  let events: unknown[];

  beforeEach(async () => {
    h = await createHarness();
    events = [];
    h.bus.changes.subscribe((change) => events.push(change));
  });

  it('announces a reconciliation that changed devices, and stays quiet when nothing changed', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    expect(events).toEqual([{ kind: 'inventory' }]);
    events.length = 0;
    await h.reconcile(inventory('1', [node('5')]));
    expect(events).toEqual([]);
  });

  const report = (nodeId: string) => ({
    nodeId,
    endpointId: 1,
    clusterId: 0x0006,
    attributeId: 0,
    value: true,
    observedAt: new Date().toISOString(),
    source: 'subscription_report' as const,
  });

  it('announces the endpoint whose state a report changed, and nothing for an unknown endpoint', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const endpoint = await h.one('endpoints', { endpointId: 1 });
    events.length = 0;
    await h.state.ingestReport(report('5'));
    expect(events).toEqual([{ kind: 'state', endpointRef: endpoint.id }]);
    events.length = 0;
    await h.state.ingestReport(report('99'));
    expect(events).toEqual([]);
  });

  it('announces a recorded command request', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const endpoint = await h.one('endpoints', { endpointId: 1 });
    events.length = 0;
    await h.state.recordRequest({
      endpointRef: endpoint.id,
      stateKey: 'onOff.onOff',
      clusterId: 6,
      commandId: 1,
      value: true,
      requestedBy: 7,
      requestId: '3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f',
    });
    expect(events).toEqual([{ kind: 'state', endpointRef: endpoint.id }]);
  });

  it('announces lifecycle actions and endpoint edits, but not a refused action', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const target = await h.liveNode('5');
    const endpoint = await h.one('endpoints', { endpointId: 1 });
    events.length = 0;
    await h.lifecycle.updateNode(target.id, { displayName: 'A' }, ADMIN);
    await h.lifecycle.updateEndpoint(endpoint.id, { displayName: 'B' }, ADMIN);
    await h.lifecycle.archive(target.id, ADMIN);
    await h.lifecycle.restore(target.id, ADMIN);
    expect(events).toHaveLength(4);
    expect(events.every((event) => (event as { kind: string }).kind === 'inventory')).toBe(true);
    events.length = 0;
    // Claiming a detached node is a 409 and changes nothing.
    await expect(h.lifecycle.claim(target.id, {}, ADMIN)).rejects.toBeDefined();
    expect(events).toEqual([]);
  });
});
