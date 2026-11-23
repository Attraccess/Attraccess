import { SessionAutoEndService } from './session-auto-end.service';

describe('SessionAutoEndService.endOverdueSessions', () => {
  const now = new Date('2030-01-01T10:00:00Z');

  /** Overdue sessions 1-3; ending one removes it from the overdue list, like the database does. */
  const build = (endSession: (usageId: number) => Promise<unknown>) => {
    const open = new Set([1, 2, 3]);
    const deadlines = {
      findOverdue: jest.fn(async (_now: Date, limit: number) =>
        [...open].slice(0, limit).map((id) => ({ id, resourceId: 10 + id })),
      ),
    };
    const usage = {
      endSessionAutomatically: jest.fn(async (_resourceId: number, usageId: number) => {
        const ended = await endSession(usageId);
        if (ended) open.delete(usageId);
        return ended;
      }),
    };
    const cronTimer = { time: <T>(_job: string, fn: () => Promise<T>) => fn() };
    const service = new SessionAutoEndService(usage as never, {} as never, deadlines as never, cronTimer as never);
    return { service, usage, deadlines };
  };

  it('ends every overdue session once', async () => {
    const { service, usage } = build(async (id) => ({ id }));
    expect(await service.endOverdueSessions(now)).toBe(3);
    expect(usage.endSessionAutomatically).toHaveBeenCalledTimes(3);
  });

  it('leaves a session another stop is ending to the next run instead of polling it again', async () => {
    // Session 2 is being ended elsewhere (manual stop, another instance): it stays overdue until that end commits.
    const { service, usage, deadlines } = build(async (id) => (id === 2 ? null : { id }));
    expect(await service.endOverdueSessions(now)).toBe(2);
    expect(usage.endSessionAutomatically.mock.calls.filter(([, usageId]) => usageId === 2)).toHaveLength(1);
    expect(deadlines.findOverdue).toHaveBeenCalledTimes(2);
  });

  it('keeps ending the others when one fails', async () => {
    const { service, usage } = build(async (id) => {
      if (id === 1) throw new Error('flow failed');
      return { id };
    });
    expect(await service.endOverdueSessions(now)).toBe(2);
    expect(usage.endSessionAutomatically).toHaveBeenCalledTimes(3);
  });
});
