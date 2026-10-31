import { Repository } from 'typeorm';
import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../usage/events/resource-usage.events';

describe('resource initial state and subject cleanup', () => {
  it('delivers initial state only to the new consumer and releases the subject immediately', async () => {
    const repository = {
      findOne: jest.fn(async (query) =>
        query.relations ? { usages: [{ endTime: null, lifecyclePending: false }] } : { id: 1 },
      ),
    };
    const service = new ResourceEventsService(repository as unknown as Repository<Resource>);
    const first = jest.fn(),
      second = jest.fn();
    const a = (await service.subscribeResource(1)).subscribe(first);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const b = (await service.subscribeResource(1)).subscribe(second);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceId: 1, inUse: true }) });
    a.unsubscribe();
    b.unsubscribe();
    expect(service['resourceSubjects'].size).toBe(0);
  });
  it('does not deliver pending initial state after disconnect', async () => {
    let resolve!: (value: unknown) => void;
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockReturnValueOnce(
          new Promise((r) => {
            resolve = r;
          }),
        ),
    };
    const service = new ResourceEventsService(repository as unknown as Repository<Resource>);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    sub.unsubscribe();
    resolve({ usages: [] });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(callback).not.toHaveBeenCalled();
    expect(service['resourceSubjects'].size).toBe(0);
  });

  it('does not let a delayed initial read override a newer usage event', async () => {
    let resolve!: (value: unknown) => void;
    const repository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 1 })
        .mockReturnValueOnce(
          new Promise((r) => {
            resolve = r;
          }),
        )
        .mockResolvedValue({ id: 1, usages: [{ endTime: null, lifecyclePending: false }] }),
    };
    const service = new ResourceEventsService(repository as unknown as Repository<Resource>);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    const usage = new ResourceUsage();
    usage.resource = Object.assign(new Resource(), { id: 1 });
    service.handleResourceUsage(new ResourceSessionStartedEvent(usage));
    resolve({ usages: [] });
    await new Promise<void>((done) => setImmediate(done));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, eventType: ResourceSessionStartedEvent.EVENT_NAME }),
    });
    sub.unsubscribe();
    expect(service['resourceSubjects'].size).toBe(0);
  });
});

describe('events that end or hand over a session', () => {
  const open = async () => {
    const repository = { findOne: jest.fn(async (query) => (query.relations ? { usages: [] } : { id: 1 })) };
    const service = new ResourceEventsService(repository as unknown as Repository<Resource>);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    await new Promise<void>((done) => setImmediate(done));
    callback.mockClear();
    return { service, callback, sub };
  };

  it('names only the id of the ended session owner', async () => {
    const { service, callback, sub } = await open();
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42 } as ResourceUsage, null),
    );
    await new Promise<void>((done) => setImmediate(done));
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
    const repository = {
      findOne: jest.fn(async (query) =>
        query.relations
          ? {
              type: 'machine',
              maxParallelSessions: 3,
              usages: [
                { endTime: null, lifecyclePending: false },
                { endTime: null, lifecyclePending: false },
                { endTime: new Date(), lifecyclePending: false },
                { endTime: null, lifecyclePending: true },
              ],
            }
          : { id: 1 },
      ),
    };
    const service = new ResourceEventsService(repository as unknown as Repository<Resource>);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    await new Promise<void>((done) => setImmediate(done));
    callback.mockClear();
    service.handleResourceSessionEnded(
      new ResourceUsageSessionEndedEvent({ id: 3, resourceId: 1, userId: 42 } as ResourceUsage, null),
    );
    await new Promise<void>((done) => setImmediate(done));
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, activeSessionCount: 2, maxParallelSessions: 3 }),
    });
    sub.unsubscribe();
  });

  it('reports a session_started event of an already ended usage as ended', async () => {
    const { service, callback, sub } = await open();
    const usage = Object.assign(new ResourceUsage(), {
      endTime: new Date(),
      resource: Object.assign(new Resource(), { id: 1 }),
    });
    service.handleResourceUsage(new ResourceSessionStartedEvent(usage));
    await new Promise<void>((done) => setImmediate(done));
    expect(callback.mock.calls[0][0].data).toMatchObject({
      eventType: ResourceUsageSessionEndedEvent.EVENT_NAME,
      inUse: false,
    });
    sub.unsubscribe();
  });

  it('names only the previous owner on a take-over, never the new one', async () => {
    const { service, callback, sub } = await open();
    service.handleResourceUsageTakenOver(
      new ResourceUsageSessionTakenOverEvent(
        { id: 1, name: 'Lathe' },
        new Date(),
        { id: 7, username: 'newcomer' } as User,
        { id: 42, username: 'previous' } as User,
      ),
    );
    await new Promise<void>((done) => setImmediate(done));
    const { data } = callback.mock.calls[0][0];
    expect(data).toEqual({
      eventType: ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      resourceId: 1,
      inUse: false,
      activeSessionCount: 0,
      maxParallelSessions: 1,
      ownerUserId: 42,
    });
    expect(JSON.stringify(data)).not.toContain('newcomer');
    sub.unsubscribe();
  });
});
