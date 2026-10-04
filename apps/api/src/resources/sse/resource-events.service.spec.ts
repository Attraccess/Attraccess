import { Repository } from 'typeorm';
import { Resource } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';

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
});
