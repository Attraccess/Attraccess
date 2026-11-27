import { ReaderScreenService } from './reader-screen.service';

/** A reader that reconnected to another instance before its crashed one was cleaned up (ATT-1163). */
describe('ReaderScreenService.readerMoved', () => {
  function setup(answers: boolean[]) {
    let owner: string | null = 'supervision:r1';
    const released: string[] = [];
    const requests = jest.fn(async () => answers.shift() ?? false);
    const cluster = {
      claims: {
        owner: jest.fn(async () => owner),
        release: jest.fn(async (_readerId: number, value: string) => {
          released.push(value);
          if (owner === value) owner = null;
        }),
      },
      presence: { holders: jest.fn(async () => [{ instanceId: 'b', connectedAt: 1 }]) },
      bus: { request: requests },
    };
    const service = new ReaderScreenService(cluster as never);
    service.movedRecheckMs = 0;
    const lost = jest.fn();
    service.onLost('supervision', lost);
    return { service, released, lost, setOwner: (value: string | null) => (owner = value), cluster };
  }

  it('ends a flow no live socket runs, after looking twice', async () => {
    const { service, released, lost, cluster } = setup([false, false]);
    await service.readerMoved(7);
    expect(cluster.bus.request).toHaveBeenCalledTimes(2);
    expect(released).toEqual(['supervision:r1']);
    expect(lost).toHaveBeenCalledWith(7, 'r1');
  });

  it('keeps a flow a live socket still runs', async () => {
    const { service, released, lost } = setup([true]);
    await service.readerMoved(7);
    expect(released).toEqual([]);
    expect(lost).not.toHaveBeenCalled();
  });

  it('keeps a claim whose arm reached the holder by the second look', async () => {
    const { service, released, lost } = setup([false, true]);
    await service.readerMoved(7);
    expect(released).toEqual([]);
    expect(lost).not.toHaveBeenCalled();
  });

  it('leaves a claim that changed hands meanwhile', async () => {
    const { service, released, lost, setOwner, cluster } = setup([false, false]);
    cluster.bus.request.mockImplementationOnce(async () => {
      setOwner('enrollment:new');
      return false;
    });
    await service.readerMoved(7);
    expect(released).toEqual([]);
    expect(lost).not.toHaveBeenCalled();
  });

  it('counts a holder that cannot answer as still running the flow', async () => {
    const { service, released, cluster } = setup([]);
    cluster.bus.request.mockRejectedValueOnce(new Error('timeout'));
    await service.readerMoved(7);
    expect(released).toEqual([]);
  });
});
