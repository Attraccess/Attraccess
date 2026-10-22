import { ResourceEventPersistence, ResourceSessionState } from '../persistence/port';
import { Resource, ResourceUsage } from '@attraccess/application-models';
import { ResourceEventsService } from './resource-events.service';
import { ResourceSessionStartedEvent } from '../usage/events/resource-usage.events';

describe('resource initial state and subject cleanup', () => {
  it('delivers initial state only to the new consumer and releases the subject immediately', async () => {
    const persistence: jest.Mocked<ResourceEventPersistence> = {
      exists: jest.fn().mockResolvedValue(true),
      existingIds: jest.fn(),
      sessionStates: jest.fn().mockResolvedValue([{ endTime: null, lifecyclePending: false }]),
    };
    const service = new ResourceEventsService(persistence);
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
    let resolve!: (value: ResourceSessionState[]) => void;
    const persistence: jest.Mocked<ResourceEventPersistence> = {
      exists: jest.fn().mockResolvedValue(true),
      existingIds: jest.fn(),
      sessionStates: jest.fn(
        (_resourceId: number) =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const service = new ResourceEventsService(persistence);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    sub.unsubscribe();
    resolve([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(callback).not.toHaveBeenCalled();
    expect(service['resourceSubjects'].size).toBe(0);
  });

  it('does not let a delayed initial read override a newer usage event', async () => {
    let resolve!: (value: ResourceSessionState[]) => void;
    const persistence: jest.Mocked<ResourceEventPersistence> = {
      exists: jest.fn().mockResolvedValue(true),
      existingIds: jest.fn(),
      sessionStates: jest.fn(
        (_resourceId: number) =>
          new Promise((done) => {
            resolve = done;
          }),
      ),
    };
    const service = new ResourceEventsService(persistence);
    const callback = jest.fn();
    const sub = (await service.subscribeResource(1)).subscribe(callback);
    const usage = {} as ResourceUsage;
    usage.resource = Object.assign({} as Resource, { id: 1 });
    service.handleResourceUsage(new ResourceSessionStartedEvent(usage));
    resolve([]);
    await new Promise<void>((done) => setImmediate(done));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      data: expect.objectContaining({ inUse: true, eventType: ResourceSessionStartedEvent.EVENT_NAME }),
    });
    sub.unsubscribe();
    expect(service['resourceSubjects'].size).toBe(0);
  });
});
