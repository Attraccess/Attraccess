import { Test } from '@nestjs/testing';
import { ReservationEventHandlers } from './events/event-handlers.service';
import { resolveHookServices } from './hooks/runtime';
import { ReservationScheduler } from './scheduler/scheduler.service';
import { RESERVATION_NOTIFIER } from './constants';
import { ReservationNotifications } from './notifications/notifier.service';
import plugin from './plugin';
import { createHarness } from './testing/harness.test-utils';

describe('plugin module wiring', () => {
  it('resolves the whole provider graph, publishes the hooks and shuts down cleanly', async () => {
    const h = await createHarness();
    await h.enable(1);
    const moduleRef = await Test.createTestingModule({ imports: [plugin.register(h.context)] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      expect(moduleRef.get(RESERVATION_NOTIFIER)).toBe(moduleRef.get(ReservationNotifications));
      expect(moduleRef.get(ReservationScheduler)).toBeDefined();
      expect(moduleRef.get(ReservationEventHandlers)).toBeDefined();
      await resolveHookServices(50);
      await expect(
        plugin.preStartHook?.({
          resourceId: 2,
          userId: 1,
          principal: 1,
          action: 'start',
          origin: 'web',
          confirmedStepKeys: [],
          language: 'en',
          now: new Date(),
        }),
      ).resolves.toEqual({ decision: 'allow' });
      await expect(
        plugin.sessionEndHook?.({
          resourceId: 2,
          userId: 1,
          sessionId: 1,
          origin: 'web',
          language: 'en',
          now: new Date(),
        }),
      ).resolves.toEqual({ decision: 'none' });
      expect(plugin.notificationCategories?.length).toBeGreaterThan(0);
    } finally {
      await app.close();
      await h.close();
    }
    await expect(resolveHookServices(10)).rejects.toThrow('not ready');
  });
});
