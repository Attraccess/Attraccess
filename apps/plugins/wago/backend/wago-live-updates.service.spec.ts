import type { AuthenticatedUser, PluginContext, PluginLiveTopic } from '@attraccess/plugins-backend-sdk';
import { WagoLiveUpdatesService } from './wago-live-updates.service';
import { WagoService } from './controllers/service';
import { WagoCommissioningService } from './commissioning/service';
import { WagoDiagnosticsService } from './diagnostics/service';
import { WagoManagedRuntimeService } from './runtime/managed/service';
import { WagoNetworkChangeService } from './network/service';

describe('WAGO bundled status sources', () => {
  function setup() {
    const topics = new Map<string, PluginLiveTopic>();
    const existsBy = jest.fn(async () => true);
    const context = {
      liveUpdates: {
        register: (topic: PluginLiveTopic) => {
          topics.set(topic.topic, topic);
          return () => undefined;
        },
      },
      getRepository: () => ({ existsBy }),
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
    return { topics, existsBy, get };
  }

  it('retains REST permissions, validates safe entity IDs, and distinguishes commissioning administration', async () => {
    const { topics, existsBy } = setup();
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
    existsBy.mockResolvedValue(false);
    await expect(
      topics.get('diagnostics').authorize({ topic: 'diagnostics', identifier: '2' }, user),
    ).rejects.toThrow();
  });

  it('shares samplers, survives transient errors, and stops sampling on final unsubscribe', async () => {
    jest.useFakeTimers();
    try {
      const { topics, get } = setup();
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
