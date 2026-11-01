import { FindOperator, Repository } from 'typeorm';
import {
  Resource,
  ResourceHealthStatus,
  ResourceType,
  ResourceUsage,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../usage/events/resource-usage.events';
import { ResourceHealthChangedEvent } from '../health/events/resource-health-changed.event';
import { activeUsageWhere } from '../usage/sessions/active-usage';

const flush = () => new Promise<void>((done) => setImmediate(done));

/** A published, running usage session; override fields to describe other rows. */
const row = (overrides: Partial<ResourceUsage> = {}) =>
  ({
    resourceId: 1,
    usageAction: ResourceUsageAction.Usage,
    isFinalized: true,
    lifecyclePending: false,
    endTime: null,
    ...overrides,
  }) as ResourceUsage;

/** Applies a TypeORM where object to in-memory rows, enough for equality and IsNull(). */
const matches = (usage: ResourceUsage, where: Record<string, unknown>) =>
  Object.entries(where).every(([column, expected]) => {
    const value = usage[column as keyof ResourceUsage];
    if (expected instanceof FindOperator) {
      if (expected.type !== 'isNull') throw new Error(`Unsupported operator ${expected.type}`);
      return value == null;
    }
    return value === expected;
  });

const createService = (options: { resource?: Partial<Resource>; usages?: ResourceUsage[] } = {}) => {
  const resource = { id: 1, type: ResourceType.Machine, maxParallelSessions: 1, ...options.resource };
  const usages = options.usages ?? [];
  const resourceRepository = { findOne: jest.fn(async () => resource) };
  const usageRepository = {
    count: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => usages.filter((usage) => matches(usage, where)).length,
    ),
  };
  const service = new ResourceEventsService(
    resourceRepository as unknown as Repository<Resource>,
    usageRepository as unknown as Repository<ResourceUsage>,
  );
  return { service, resourceRepository, usageRepository };
};

const startedEvent = (overrides: Partial<ResourceUsage> = {}) =>
  new ResourceSessionStartedEvent(
    Object.assign(new ResourceUsage(), { resource: Object.assign(new Resource(), { id: 1 }), ...overrides }),
  );

describe('resource initial state and subject cleanup', () => {
  it('delivers initial state only to the new consumer and releases the subject immediately', async () => {
    const { service } = createService({ usages: [row()] });
    const first = jest.fn(),
      second = jest.fn();
    const a = (await service.subscribeResource(1)).subscribe(first);
    await flush();
    const b = (await service.subscribeResource(1)).subscribe(second);
    await flush();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({
      data: expect.objectContaining({ resourceId: 1, inUse: true, activeSessionCount: 1, maxParallelSessions: 1 }),
    });
    a.unsubscribe();
    b.unsubscribe();
    expect(service['resourceSubjects'].size).toBe(0);
  });

  it('does not deliver pending initial state after disconnect', async () => {
    let resolve!: (value: number) => void;
    const { service, usageRepository } = createService();
    usageRepository.count.mockReturnValueOnce(new Promise<number>((r) => (resolve = r)));
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    sub.unsubscribe();
    resolve(0);
    await flush();
    expect(callback).not.toHaveBeenCalled();
    expect(service['resourceSubjects'].size).toBe(0);
  });

  it('does not let a delayed initial read override a newer usage event', async () => {
    let resolve!: (value: number) => void;
    const { service, usageRepository } = createService({ usages: [row()] });
    usageRepository.count.mockReturnValueOnce(new Promise<number>((r) => (resolve = r)));
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    service.handleResourceUsage(startedEvent());
    resolve(0);
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, eventType: ResourceSessionStartedEvent.EVENT_NAME }),
    });
    sub.unsubscribe();
    expect(service['resourceSubjects'].size).toBe(0);
  });
});

describe('slot state reads', () => {
  it('reads nothing from the database for events on a resource nobody follows', async () => {
    const { service, resourceRepository, usageRepository } = createService({ usages: [row()] });
    service.handleResourceUsage(startedEvent());
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42 } as ResourceUsage, null),
    );
    service.handleResourceUsageTakenOver(
      new ResourceUsageSessionTakenOverEvent({ id: 1, name: 'Lathe' }, new Date(), { id: 7 } as User, null),
    );
    service.handleResourceHealthChanged(
      new ResourceHealthChangedEvent(1, 'power', ResourceHealthStatus.UNHEALTHY, null, null),
    );
    await flush();
    expect(resourceRepository.findOne).not.toHaveBeenCalled();
    expect(usageRepository.count).not.toHaveBeenCalled();
    expect(service['emitQueues'].size).toBe(0);
  });

  it('skips the read for a queued event whose last subscriber has left', async () => {
    const { service, usageRepository } = createService();
    const sub = (await service.subscribeResource(1)).subscribe(jest.fn());
    await flush();
    usageRepository.count.mockClear();
    service.handleResourceUsage(startedEvent());
    sub.unsubscribe();
    await flush();
    expect(usageRepository.count).not.toHaveBeenCalled();
  });

  it('counts only published, running usage sessions, like GET usage/active', async () => {
    const { service, usageRepository } = createService({
      resource: { maxParallelSessions: 5 },
      usages: [
        row(),
        row({ endTime: new Date() }),
        row({ lifecyclePending: true }),
        row({ isFinalized: false }),
        row({ usageAction: ResourceUsageAction.DoorUnlock }),
        row({ resourceId: 2 }),
      ],
    });
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    await flush();
    expect(usageRepository.count).toHaveBeenCalledWith({ where: { resourceId: 1, ...activeUsageWhere() } });
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, activeSessionCount: 1, maxParallelSessions: 5 }),
    });
    sub.unsubscribe();
  });

  it('reports a limit of 1 for doors', async () => {
    const { service } = createService({ resource: { type: ResourceType.Door, maxParallelSessions: 4 } });
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    await flush();
    expect(callback).toHaveBeenCalledWith({ data: expect.objectContaining({ maxParallelSessions: 1 }) });
    sub.unsubscribe();
  });
});

describe('session and health events', () => {
  const open = async (options: Parameters<typeof createService>[0] = {}) => {
    const created = createService(options);
    const callback = jest.fn();
    const sub = (await created.service.subscribeResource(1)).subscribe(callback);
    await flush();
    callback.mockClear();
    return { ...created, callback, sub };
  };

  it('names only the id of the ended session owner', async () => {
    const { service, callback, sub } = await open();
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42 } as ResourceUsage, null),
    );
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      data: {
        eventType: ResourceUsageSessionEndedEvent.EVENT_NAME,
        resourceId: 1,
        inUse: false,
        activeSessionCount: 0,
        maxParallelSessions: 1,
        ownerUserId: 42,
      },
    });
    sub.unsubscribe();
  });

  it('never reports inUse:false while other sessions remain and carries count and limit', async () => {
    const { service, callback, sub } = await open({
      resource: { maxParallelSessions: 3 },
      usages: [row(), row(), row({ endTime: new Date() }), row({ lifecyclePending: true })],
    });
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42 } as ResourceUsage, null),
    );
    await flush();
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, activeSessionCount: 2, maxParallelSessions: 3 }),
    });
    sub.unsubscribe();
  });

  it('reports session_started events, such as door actions stored already ended, as started', async () => {
    const { service, callback, sub } = await open();
    service.handleResourceUsage(startedEvent({ usageAction: ResourceUsageAction.DoorUnlock, endTime: new Date() }));
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].data).toMatchObject({
      eventType: ResourceSessionStartedEvent.EVENT_NAME,
      inUse: false,
      activeSessionCount: 0,
    });
    sub.unsubscribe();
  });

  it('sends exactly one session_ended for the events emitted when a session ends', async () => {
    const { service, callback, sub } = await open({ resource: { maxParallelSessions: 2 }, usages: [row()] });
    // The usage service announces an end only through ResourceUsageSessionEndedEvent.
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42, endTime: new Date() } as ResourceUsage, {
        id: 42,
        username: 'owner',
      }),
    );
    await flush();
    const types = callback.mock.calls.map(([event]) => event.data.eventType);
    expect(types).toEqual([ResourceUsageSessionEndedEvent.EVENT_NAME]);
    expect(callback.mock.calls[0][0].data).toMatchObject({ inUse: true, activeSessionCount: 1 });
    sub.unsubscribe();
  });

  it('names only the previous owner on a take-over, never the new one', async () => {
    const { service, callback, sub } = await open({ usages: [row({ userId: 7 })] });
    service.handleResourceUsageTakenOver(
      new ResourceUsageSessionTakenOverEvent(
        { id: 1, name: 'Lathe' },
        new Date(),
        { id: 7, username: 'newcomer' } as User,
        { id: 42, username: 'previous' } as User,
      ),
    );
    await flush();
    const { data } = callback.mock.calls[0][0];
    expect(data).toEqual({
      eventType: ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      resourceId: 1,
      inUse: true,
      activeSessionCount: 1,
      maxParallelSessions: 1,
      ownerUserId: 42,
    });
    expect(JSON.stringify(data)).not.toContain('newcomer');
    sub.unsubscribe();
  });

  it('adds slot state to health changes', async () => {
    const { service, callback, sub } = await open({ resource: { maxParallelSessions: 2 }, usages: [row()] });
    service.handleResourceHealthChanged(
      new ResourceHealthChangedEvent(1, 'power', ResourceHealthStatus.UNHEALTHY, 'no heartbeat', null),
    );
    await flush();
    expect(callback).toHaveBeenCalledWith({
      data: {
        eventType: ResourceHealthChangedEvent.EVENT_NAME,
        resourceId: 1,
        identifier: 'power',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'no heartbeat',
        previousStatus: null,
        inUse: true,
        activeSessionCount: 1,
        maxParallelSessions: 2,
      },
    });
    sub.unsubscribe();
  });
});
