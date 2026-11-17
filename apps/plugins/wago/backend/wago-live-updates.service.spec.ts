import { createWagoTestStorage } from './storage/testing';
import { controller } from './wago-service.test-fixture';
import type { AuthenticatedUser, PluginContext, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { WagoLiveUpdatesService } from './wago-live-updates.service';
import { WagoService } from './controllers/service';
import { WagoCommissioningService } from './commissioning/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoManagedRuntimeService } from './runtime/managed/service';
import { WagoNetworkChangeService } from './network/service';

describe('WAGO bundled status sources', () => {
  async function setup() {
    const topics = new Map<string, PluginLiveTopic>();
    const test = createWagoTestStorage();
    await test.tables.controllers.insert(controller());
    const context = {
      liveUpdates: {
        register: (topic: PluginLiveTopic) => {
          topics.set(topic.topic, topic);
          return () => undefined;
        },
      },
      storage: test.storage,
      persistence: test.persistence,
    } as unknown as PluginContext;
    const get = jest.fn(async () => ({ connected: true }));
    const service = new WagoLiveUpdatesService(
      context,
      {} as WagoService,
      {} as WagoCommissioningService,
      { get } as unknown as WagoDiagnosticsService,
      {} as WagoManagedRuntimeService,
      {} as WagoNetworkChangeService,
    );
    service.onModuleInit();
    return { topics, tables: test.tables, get };
  }

  it('retains REST permissions, validates safe entity IDs, and distinguishes commissioning administration', async () => {
    const { topics, tables } = await setup();
    const user = { id: 1, effectivePermissions: new Set(['resources.update']) } as AuthenticatedUser;
    await expect(
      topics.get('diagnostics').authorize({ topic: 'diagnostics', identifier: '1' }, user),
    ).resolves.toBeUndefined();
    await expect(
      topics.get('commissioning-sessions').authorize({ topic: 'commissioning-sessions' }, user),
    ).rejects.toThrow();
    for (const identifier of ['0', '-1', '1.2', '1:a', '9007199254740992']) {
      await expect(topics.get('diagnostics').authorize({ topic: 'diagnostics', identifier }, user)).rejects.toThrow();
    }
    // Only stored controllers and sessions are addressable.
    await expect(
      topics.get('diagnostics').authorize({ topic: 'diagnostics', identifier: '2' }, user),
    ).rejects.toThrow();
    const admin = { id: 1, effectivePermissions: new Set(['system.settings.manage']) } as AuthenticatedUser;
    const verification = { topic: 'commissioning-verification', identifier: '5' };
    await expect(topics.get('commissioning-verification').authorize(verification, admin)).rejects.toThrow();
    await tables.commissioningSessions.insert({
      id: 5,
      hardwareId: 'cc100-01',
      mqttServerId: 2,
      targetHost: '192.168.1.10',
      hostKeyFingerprint: 'fingerprint',
      firmwareBaseline: 'baseline',
      state: 'awaiting_delivery',
      auditLog: '[]',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(topics.get('commissioning-verification').authorize(verification, admin)).resolves.toBeUndefined();
  });

  it('shares samplers, survives transient errors, and stops sampling on final unsubscribe', async () => {
    jest.useFakeTimers();
    try {
      const { topics, get } = await setup();
      const topic = topics.get('diagnostics');
      const subscription = { topic: 'diagnostics', identifier: '1' };
      const user = { id: 1 } as AuthenticatedUser;
      const first = jest.fn(),
        second = jest.fn();
      const a = topic.source(subscription, user).subscribe(first);
      const b = topic.source(subscription, user).subscribe(second);
      await jest.advanceTimersByTimeAsync(0);
      expect(get).toHaveBeenCalledTimes(1);
      expect(first).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: { connected: true } } });
      expect(second).toHaveBeenCalledTimes(1);
      a.unsubscribe();
      get.mockRejectedValueOnce(new Error('private device error'));
      await jest.advanceTimersByTimeAsync(2_000);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenLastCalledWith({ data: { eventType: 'unavailable' } });
      await jest.advanceTimersByTimeAsync(2_000);
      expect(second).toHaveBeenLastCalledWith({ data: { eventType: 'snapshot', value: { connected: true } } });
      b.unsubscribe();
      await jest.advanceTimersByTimeAsync(20_000);
      expect(get).toHaveBeenCalledTimes(3);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
