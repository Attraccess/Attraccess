import { MachineBusyError } from '../errors/machine-busy.error';
import { ProjectSwitchPendingError } from '../errors/project-switch-pending.error';
import { acrossProjectSwitches, PROJECT_SWITCH_WAIT_MS, RETRY_FIRST_MS, RETRY_MAX_MS } from './across-project-switches';

/** A chain of parts and whether a switch is pending on the machine, as the store reports them. */
class FakeStore {
  readonly continuations = new Map<number, number>();
  pending = false;

  findContinuationId = jest.fn(async (usageId: number) => this.continuations.get(usageId) ?? null);
  isProjectSwitchPending = jest.fn(async () => this.pending);
}

const RESOURCE_ID = 5;

describe('acrossProjectSwitches', () => {
  let store: FakeStore;

  beforeEach(() => {
    jest.useFakeTimers();
    store = new FakeStore();
  });

  afterEach(() => jest.useRealTimers());

  /** Starts the change and records how it settles, without awaiting it. */
  function run(change: (partId: number) => Promise<string>, waitMs?: number) {
    const outcome: { value?: string; error?: unknown; settled: boolean } = { settled: false };
    void acrossProjectSwitches(store, RESOURCE_ID, 1, change, waitMs === undefined ? {} : { waitMs }).then(
      (value) => Object.assign(outcome, { value, settled: true }),
      (error) => Object.assign(outcome, { error, settled: true }),
    );
    return outcome;
  }

  it('starts on the newest part when the session was switched before', async () => {
    store.continuations.set(1, 2).set(2, 3);
    const change = jest.fn(async (partId: number) => `part ${partId}`);
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(0);
    expect(outcome.value).toBe('part 3');
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('follows a switch that committed while the change ran, without pausing', async () => {
    const change = jest.fn(async (partId: number) => {
      if (partId === 1) {
        store.continuations.set(1, 2); // the switch committed first; part 1 has ended
        throw new Error('This session has ended');
      }
      return `part ${partId}`;
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(0);
    expect(outcome.value).toBe('part 2');
    expect(change.mock.calls.map(([partId]) => partId)).toEqual([1, 2]);
  });

  it('waits while a switch is pending, then reaches the continuation', async () => {
    store.pending = true;
    const change = jest.fn(async (partId: number) => {
      if (store.pending) throw new ProjectSwitchPendingError();
      return `part ${partId}`;
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(RETRY_FIRST_MS * 3);
    expect(outcome.settled).toBe(false);
    store.pending = false;
    store.continuations.set(1, 2);
    await jest.advanceTimersByTimeAsync(RETRY_MAX_MS);
    expect(outcome.value).toBe('part 2');
  });

  it('waits while a switch is pending, then reaches the old part when the switch was rolled back', async () => {
    store.pending = true;
    const change = jest.fn(async (partId: number) => {
      if (store.pending) throw new ProjectSwitchPendingError();
      return `part ${partId}`;
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(RETRY_FIRST_MS * 3);
    store.pending = false;
    await jest.advanceTimersByTimeAsync(RETRY_MAX_MS);
    expect(outcome.value).toBe('part 1');
  });

  it('retries a busy machine while another session of it is being switched', async () => {
    store.pending = true;
    const change = jest
      .fn<Promise<string>, [number]>()
      .mockRejectedValueOnce(new MachineBusyError())
      .mockResolvedValue('done');
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(RETRY_FIRST_MS);
    expect(outcome.value).toBe('done');
    expect(change).toHaveBeenCalledTimes(2);
  });

  it('pauses longer each time, up to a cap', async () => {
    store.pending = true;
    const triedAt: number[] = [];
    const change = jest.fn(async () => {
      triedAt.push(Date.now());
      throw new ProjectSwitchPendingError();
    });
    run(change);
    await jest.advanceTimersByTimeAsync(15_000);
    const pauses = triedAt.slice(1).map((at, i) => at - triedAt[i]);
    expect(pauses.slice(0, 6)).toEqual([200, 400, 800, 1600, RETRY_MAX_MS, RETRY_MAX_MS]);
  });

  it('gives up with the last error once the wait it was given is over', async () => {
    store.pending = true;
    const change = jest.fn(async () => {
      throw new ProjectSwitchPendingError();
    });
    const outcome = run(change, 30_000);
    await jest.advanceTimersByTimeAsync(30_000 - 1);
    expect(outcome.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(outcome.error).toBeInstanceOf(ProjectSwitchPendingError);
    // Backing off keeps the tries few: 200 ms steady polling would have made 150 of them.
    expect(change.mock.calls.length).toBeLessThan(20);
  });

  it('waits up to ten minutes without a wait of its own (a flow has nobody to retry)', async () => {
    store.pending = true;
    const change = jest.fn(async () => {
      throw new ProjectSwitchPendingError();
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(PROJECT_SWITCH_WAIT_MS - 1);
    expect(outcome.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(outcome.error).toBeInstanceOf(ProjectSwitchPendingError);
  });

  it('rethrows a busy machine at once when no switch is pending', async () => {
    const change = jest.fn(async () => {
      throw new MachineBusyError();
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(0);
    expect(outcome.error).toBeInstanceOf(MachineBusyError);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('rethrows any other error at once, even while a switch is pending', async () => {
    store.pending = true;
    const refusal = new Error('not allowed');
    const change = jest.fn(async () => {
      throw refusal;
    });
    const outcome = run(change);
    await jest.advanceTimersByTimeAsync(0);
    expect(outcome.error).toBe(refusal);
    expect(change).toHaveBeenCalledTimes(1);
  });
});
