import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, PluginContext, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { MATTER_OPERATIONS } from '../permissions';
import {
  ADMIN,
  createHarness,
  inventory,
  node,
  timeoutError,
  type Harness,
} from '../testing/devices-harness.test-utils';
import { LIVE_COALESCE_MS, MatterLiveUpdatesService } from './live-updates.service';

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

    it('refuses before looking the endpoint up, so a user without the key cannot probe which endpoints exist', async () => {
      const subscribe = (identifier: string, who: AuthenticatedUser) =>
        Promise.resolve(topics['device-state'].authorize({ topic: 'device-state', identifier }, who));
      const getEndpoint = jest.spyOn(h.lifecycle, 'getEndpoint');
      for (const who of [user([]), user(['thread.network.read']), user(['matter.devices.manage'])]) {
        await expect(subscribe('3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f', who)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(subscribe('not-a-uuid', who)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(getEndpoint).not.toHaveBeenCalled();
    });
  });

  describe('source', () => {
    it('coalesces a burst of inventory changes into one data-free signal', async () => {
      jest.useFakeTimers();
      try {
        const received: unknown[] = [];
        const subscription = topics['devices']
          .source({ topic: 'devices' }, user(READ))
          .subscribe((m) => received.push(m));
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

  it('announces every finished reconciliation: with changes, without changes, and a failed one', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    expect(events).toEqual([{ kind: 'inventory' }]);
    events.length = 0;
    // Nothing changed, but the reconciliation status (last run, outcome) did.
    expect((await h.reconcile(inventory('1', [node('5')]))).lastResult).toBe('applied');
    expect(events).toEqual([{ kind: 'inventory' }]);
    events.length = 0;
    expect((await h.reconcile(timeoutError())).lastResult).toBe('failed');
    expect(events).toEqual([{ kind: 'inventory' }]);
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
    await expect(h.lifecycle.claim(target.id, {}, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    expect(events).toEqual([]);
  });

  const only = (kind: string) => events.filter((event) => (event as { kind: string }).kind === kind);

  it('announces a claim', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    events.length = 0;
    await h.lifecycle.claim((await h.liveNode('5')).id, { displayName: 'Press' }, ADMIN);
    expect(events).toEqual([{ kind: 'inventory' }]);
  });

  it('announces a force-remove', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    events.length = 0;
    await h.lifecycle.forceRemove((await h.liveNode('5')).id, ADMIN);
    expect(events).toEqual([{ kind: 'inventory' }]);
  });

  it('announces a repair', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const target = await h.liveNode('5');
    await h.reconcile(inventory('1', []));
    h.sidecar.fabricId = '1';
    h.sidecar.list = inventory('1', [node('5')]);
    events.length = 0;
    await h.lifecycle.repair(target.id, ADMIN);
    expect(only('inventory').length).toBeGreaterThanOrEqual(1);
  });

  it('announces a relink', async () => {
    await h.reconcile(inventory('1', [node('5')]));
    const target = await h.liveNode('5');
    await h.lifecycle.claim(target.id, {}, ADMIN);
    await h.reconcile(inventory('1', []));
    await h.reconcile(inventory('1', [node('9', { serialNumber: 'SN-5' })]));
    const source = await h.liveNode('9');
    events.length = 0;
    await h.lifecycle.relink(target.id, { sourceNodeId: source.id, confirmIdentityMismatch: true }, ADMIN);
    expect(only('inventory')).toEqual([{ kind: 'inventory' }]);
  });
});

describe('State change emission', () => {
  let h: Harness;
  let events: { kind: string; endpointRef?: string }[];
  let first: string;
  let second: string;
  const T0 = Date.now();
  const at = (ms: number) => new Date(T0 + ms).toISOString();

  const report = (nodeId: string, value: boolean, ms: number, attributeId = 0) => ({
    type: 'device.state' as const,
    payload: {
      nodeId,
      endpointId: 1,
      clusterId: 0x0006,
      attributeId,
      value,
      observedAt: at(ms),
      source: 'subscription_report' as const,
    },
  });
  const request = (requestId: string) =>
    h.state.recordRequest(
      {
        endpointRef: first,
        stateKey: 'onOff.onOff',
        clusterId: 6,
        commandId: 1,
        value: true,
        requestedBy: 7,
        requestId,
      },
      at(1_000),
    );

  beforeEach(async () => {
    h = await createHarness();
    await h.reconcile(inventory('1', [node('5'), node('6')]));
    first = (await h.one('endpoints', { endpointId: 1, nodeRef: (await h.liveNode('5')).id })).id;
    second = (await h.one('endpoints', { endpointId: 1, nodeRef: (await h.liveNode('6')).id })).id;
    events = [];
    h.bus.changes.subscribe((change) => events.push(change));
  });
  afterEach(() => h.close());

  it('announces each touched endpoint once for a whole batch', async () => {
    await h.state.ingest([report('5', true, 0), report('5', false, 10), report('6', true, 20)], at(30));
    expect(events).toEqual([
      { kind: 'state', endpointRef: first },
      { kind: 'state', endpointRef: second },
    ]);
  });

  it('after a rolled-back batch announces only the events that applied one by one', async () => {
    const original = (h.state as unknown as { reportIn: (...args: unknown[]) => Promise<void> }).reportIn.bind(h.state);
    jest
      .spyOn(h.state as unknown as { reportIn: (...args: unknown[]) => Promise<void> }, 'reportIn')
      .mockImplementation((...args: unknown[]) => {
        const payload = args[2] as { nodeId: string };
        if (payload.nodeId === '6') return Promise.reject(new Error('cannot apply'));
        return original(...args);
      });
    await h.state.ingest([report('5', true, 0), report('6', true, 10)], at(20));
    expect(events).toEqual([{ kind: 'state', endpointRef: first }]);
    expect(h.state.stats.applied).toBe(1);
  });

  it('never applies a committed batch twice when announcing it throws', async () => {
    jest.spyOn(h.bus, 'stateChanged').mockImplementationOnce(() => {
      throw new Error('listener');
    });
    await expect(h.state.ingest([report('5', true, 0)], at(10))).rejects.toThrow('listener');
    // Counted once: the batch was not taken for failed and applied again event by event.
    expect(h.state.stats.applied).toBe(1);
  });

  it('announces a command timeout and outcome only when they change the state row', async () => {
    const requestId = randomUUID();
    await request(requestId);
    events.length = 0;
    await h.state.recordTimeout(requestId, at(3_000));
    expect(events).toEqual([{ kind: 'state', endpointRef: first }]);
    events.length = 0;
    // Already uncertain: a second timeout changes nothing.
    await h.state.recordTimeout(requestId, at(3_500));
    expect(events).toEqual([]);
    // An outcome for a command nobody requested changes nothing either.
    await h.state.ingestOutcome(
      {
        requestId: randomUUID(),
        outcome: 'accepted',
        acceptedAt: at(2_000),
        reportedAt: null,
        nodeId: '5',
        endpointId: 1,
      },
      at(3_600),
    );
    expect(events).toEqual([]);
  });

  it('announces an accepted command outcome', async () => {
    const requestId = randomUUID();
    await request(requestId);
    events.length = 0;
    await h.state.ingestOutcome(
      { requestId, outcome: 'accepted', acceptedAt: at(2_000), reportedAt: null, nodeId: '5', endpointId: 1 },
      at(2_100),
    );
    expect(events).toEqual([{ kind: 'state', endpointRef: first }]);
  });
});
