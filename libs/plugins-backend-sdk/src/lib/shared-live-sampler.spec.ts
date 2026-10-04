import { createSharedLiveSampler } from './shared-live-sampler';

describe('shared live sampler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts on subscribe, shares reads per key, and replays the latest sample to late subscribers', async () => {
    const sample = createSharedLiveSampler<string, number>();
    const read = jest.fn(async () => 1);
    const otherRead = jest.fn(async () => 2);
    const first = jest.fn();
    const second = jest.fn();
    const late = jest.fn();
    const source = sample('device-a', 1_000, read);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(read).not.toHaveBeenCalled();

    const a = source.subscribe(first);
    const b = sample('device-a', 1_000, read).subscribe(second);
    const other = sample('device-b', 1_000, otherRead).subscribe();
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(otherRead).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: 1 } });
    expect(second).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: 1 } });

    const c = source.subscribe(late);
    expect(late).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: 1 } });
    expect(read).toHaveBeenCalledTimes(1);
    a.unsubscribe();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(2);
    b.unsubscribe();
    c.unsubscribe();
    other.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('skips ticks while a read is pending', async () => {
    const sample = createSharedLiveSampler<string, number>();
    let finishRead: (value: number) => void;
    const read = jest.fn(async () => 2).mockImplementationOnce(() => new Promise((resolve) => (finishRead = resolve)));
    const next = jest.fn();
    const subscription = sample('device', 1_000, read).subscribe(next);

    await jest.advanceTimersByTimeAsync(3_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    finishRead(1);
    await jest.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: 1 } });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenLastCalledWith({ data: { eventType: 'snapshot', value: 2 } });
    subscription.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports unavailable without exposing device errors, then recovers on the next tick', async () => {
    const sample = createSharedLiveSampler<string, number>();
    const read = jest.fn(async () => 1).mockRejectedValueOnce(new Error('private device password'));
    const next = jest.fn();
    const subscription = sample('device', 1_000, read).subscribe(next);

    await jest.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledWith({ data: { eventType: 'unavailable' } });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(next).toHaveBeenLastCalledWith({ data: { eventType: 'snapshot', value: 1 } });
    subscription.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('releases pending sampling and reuses the current sampler when an old observable is subscribed again', async () => {
    const sample = createSharedLiveSampler<string, number>();
    let finishRead: (value: number) => void;
    const read = jest.fn(async () => 2).mockImplementationOnce(() => new Promise((resolve) => (finishRead = resolve)));
    const next = jest.fn();
    const source = sample('device', 1_000, read);
    const original = source.subscribe(next);
    await jest.advanceTimersByTimeAsync(0);
    original.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
    finishRead(1);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(next).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);

    const current = sample('device', 1_000, read).subscribe();
    const reused = source.subscribe(next);
    expect(next).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledWith({ data: { eventType: 'snapshot', value: 2 } });
    current.unsubscribe();
    reused.unsubscribe();
    expect(jest.getTimerCount()).toBe(0);
  });
});
