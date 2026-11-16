import { firstValueFrom, take, toArray } from 'rxjs';
import { ResourceEventsService } from './resource-events.service';

describe('ResourceEventsService start-blocked bridge', () => {
  const resource = { id: 3, type: 'machine', maxParallelSessions: 1 };
  const build = () => {
    const resources = { findOne: jest.fn().mockResolvedValue(resource) };
    const usages = { count: jest.fn().mockResolvedValue(0) };
    return new ResourceEventsService(resources as never, usages as never);
  };

  it("pushes a plugin's start-blocked change to open pages of that resource as a live event", async () => {
    const service = build();
    const events = firstValueFrom((await service.subscribeResource(3)).pipe(take(2), toArray()));
    await new Promise((resolve) => setTimeout(resolve, 10));
    service.handleStartBlockedChanged({ pluginName: 'reservations', resourceId: 3 });
    const received = (await events).map((event) => event.data);
    expect(received[1]).toMatchObject({
      eventType: 'resource.start_blocked_changed',
      resourceId: 3,
      inUse: false,
      activeSessionCount: 0,
    });
    service.onModuleDestroy();
  });

  it('does nothing while nobody watches the resource', () => {
    const service = build();
    service.handleStartBlockedChanged({ pluginName: 'reservations', resourceId: 4 });
    expect((service as unknown as { queuedEvents: Map<number, number> }).queuedEvents.size).toBe(0);
  });
});
