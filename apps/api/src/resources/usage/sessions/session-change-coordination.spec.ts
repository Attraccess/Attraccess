import { MachineBusyError } from '../errors/machine-busy.error';
import {
  COMMAND_TIMEOUT_MS,
  LOCK_TTL_MS,
  LocalSessionChangeCoordination,
  ValkeySessionChangeCoordination,
} from './session-change-coordination';
import { FakeValkey } from './fake-valkey.test-fixture';
import { SessionChangeQueue } from './session-change-queue';

const coordinationOn = (valkey: FakeValkey, instance = 'host-a:3000', bootWaitMs = 0) =>
  new ValkeySessionChangeCoordination(valkey as never, instance, bootWaitMs);
const LOCK_1 = 'attraccess:session-change:lock:1';
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('ValkeySessionChangeCoordination', () => {
  afterEach(() => jest.useRealTimers());

  it('lets only one API instance hold a machine at a time', async () => {
    const valkey = new FakeValkey();
    const first = coordinationOn(valkey);
    const second = coordinationOn(valkey, 'host-b:3000');
    const release = await first.acquire(1, 1000);
    await expect(second.acquire(1, 120)).rejects.toBeInstanceOf(MachineBusyError);
    // Other machines are independent.
    await (
      await second.acquire(2, 100)
    )();
    await release();
    await (
      await second.acquire(1, 100)
    )();
  });

  it('hands the machine to a waiting instance when the holder releases', async () => {
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey).acquire(1, 1000);
    const waiting = coordinationOn(valkey, 'host-b:3000').acquire(1, 2000);
    setTimeout(() => void release(), 100);
    await expect(waiting).resolves.toEqual(expect.any(Function));
  });

  it('keeps renewing the lock while a change runs far past its time to live', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey).acquire(1, 1000);
    for (let i = 0; i < 12; i++) {
      await jest.advanceTimersByTimeAsync(5_000);
      await flush();
    }
    // 60 s later the lock is still held, so another instance still has to wait.
    expect(valkey.data.get(LOCK_1)?.expiresAt).toBeGreaterThan(Date.now());
    const other = coordinationOn(valkey, 'host-b:3000').acquire(1, 100);
    const outcome = expect(other).rejects.toBeInstanceOf(MachineBusyError);
    await jest.advanceTimersByTimeAsync(200);
    await outcome;
    await release();
  });

  it('sets a lock again that vanished with Valkey`s data while its holder still runs', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey).acquire(1, 1000);
    const token = valkey.data.get(LOCK_1)?.value;
    valkey.data.clear();
    await jest.advanceTimersByTimeAsync(5_000);
    await flush();
    expect(valkey.data.get(LOCK_1)?.value).toBe(token);
    await release();
  });

  it('frees the machine after the holder crashed (lock expires)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const valkey = new FakeValkey();
    await coordinationOn(valkey).acquire(1, 1000);
    // No renewal and no release: the process is gone.
    jest.clearAllTimers();
    jest.setSystemTime(Date.now() + LOCK_TTL_MS + 1_000);
    await expect(coordinationOn(valkey, 'host-b:3000').acquire(1, 100)).resolves.toEqual(expect.any(Function));
  });

  it('takes over the lock its own previous run left behind, but never another instance`s', async () => {
    const valkey = new FakeValkey();
    await coordinationOn(valkey).acquire(1, 1000);
    await coordinationOn(valkey, 'host-b:3000').acquire(2, 1000);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.clearAllTimers(); // both processes are gone
    jest.useRealTimers();
    const restarted = coordinationOn(valkey);
    const startedAt = Date.now();
    await (
      await restarted.acquire(1, 1000)
    )();
    expect(Date.now() - startedAt).toBeLessThan(100);
    await expect(restarted.acquire(2, 100)).rejects.toBeInstanceOf(MachineBusyError);
  });

  it('never releases a lock that expired and was taken over by someone else', async () => {
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey).acquire(1, 1000);
    const held = valkey.data.get(LOCK_1);
    if (held) held.value = 'someone-else';
    await release();
    expect(valkey.data.get(LOCK_1)?.value).toBe('someone-else');
  });

  it('falls back to this instance when Valkey is unreachable', async () => {
    const valkey = new FakeValkey();
    valkey.failing = true;
    const release = await coordinationOn(valkey).acquire(1, 100);
    await expect(release()).resolves.toBeUndefined();
  });

  it('falls back at once while the client reconnects', async () => {
    const valkey = new FakeValkey();
    valkey.status = 'reconnecting';
    valkey.stalled = true;
    const startedAt = Date.now();
    await (
      await coordinationOn(valkey).acquire(1, 30_000)
    )();
    expect(Date.now() - startedAt).toBeLessThan(COMMAND_TIMEOUT_MS);
  });

  it('gives up on a stalled Valkey after its command timeout instead of the whole wait', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const valkey = new FakeValkey();
    valkey.stalled = true;
    const acquired = coordinationOn(valkey).acquire(1, 30_000);
    await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
    const release = await acquired;
    // A stalled release does not hang either.
    const released = release();
    await jest.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS);
    await expect(released).resolves.toBeUndefined();
  });

  it('keeps waiting for a holder it has seen when Valkey fails, instead of running alongside it', async () => {
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey).acquire(1, 1000);
    const waiting = coordinationOn(valkey, 'host-b:3000').acquire(1, 300);
    const outcome = expect(waiting).rejects.toBeInstanceOf(MachineBusyError);
    await new Promise((resolve) => setTimeout(resolve, 80));
    valkey.failing = true;
    await outcome;
    valkey.failing = false;
    await release();
  });

  it('keeps waiting when Valkey fails right after it saw another holder', async () => {
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey, 'host-b:3000').acquire(1, 1000);
    jest.spyOn(valkey, 'get').mockRejectedValueOnce(new Error('valkey down'));
    await expect(coordinationOn(valkey).acquire(1, 200)).rejects.toBeInstanceOf(MachineBusyError);
    await release();
  });

  it('counts a lock write that answered too late but landed as its own', async () => {
    const valkey = new FakeValkey();
    const release = await coordinationOn(valkey, 'host-b:3000').acquire(1, 1000);
    const set = valkey.set.bind(valkey);
    let lockWrites = 0;
    jest.spyOn(valkey, 'set').mockImplementation(async (...args: Parameters<FakeValkey['set']>) => {
      // The first try sees the holder; the second one is late.
      if (args[0] !== LOCK_1 || ++lockWrites !== 2) return set(...args);
      // The holder releases while our SET is under way; it lands, but its answer never arrives in time.
      await release();
      await set(...args);
      return new Promise<never>(() => undefined);
    });
    const coordination = coordinationOn(valkey);
    const releaseOwn = await coordination.acquire(1, 3000);
    expect(valkey.data.get(LOCK_1)?.value).toMatch(/^host-a:3000\|/);
    await releaseOwn();
    expect(valkey.data.has(LOCK_1)).toBe(false);
  });

  it('cleans up a lock write that landed after it fell back to this instance', async () => {
    const valkey = new FakeValkey();
    const set = valkey.set.bind(valkey);
    jest.spyOn(valkey, 'set').mockImplementationOnce(async (...args: Parameters<FakeValkey['set']>) => {
      await set(...args);
      return new Promise<never>(() => undefined);
    });
    const release = await coordinationOn(valkey).acquire(1, 3000);
    await flush();
    expect(valkey.data.has(LOCK_1)).toBe(false);
    await release();
  });

  describe('finding attempts no instance works on any more', () => {
    it('leaves attempts of other live instances and of this instance alone', async () => {
      const valkey = new FakeValkey();
      const owner = coordinationOn(valkey, 'host-b:3000');
      const self = coordinationOn(valkey);
      const stopOther = owner.keepAlive('other');
      const stopOwn = self.keepAlive('own');
      await flush();
      expect(await self.findGone(['other', 'own', 'unknown'], true)).toEqual(new Set(['unknown']));
      stopOther();
      stopOwn();
      await flush();
      expect(await coordinationOn(valkey, 'host-c:3000').findGone(['other', 'own'], true)).toEqual(
        new Set(['other', 'own']),
      );
    });

    it('recognises the attempts of its own previous run at once, although their heartbeat has not expired', async () => {
      const valkey = new FakeValkey();
      coordinationOn(valkey).keepAlive('cut-off');
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      jest.clearAllTimers(); // the old process is gone
      const restarted = coordinationOn(valkey);
      expect(await restarted.findGone(['cut-off'], true)).toEqual(new Set(['cut-off']));
      // Another instance on another host still sees it as alive until the heartbeat expires.
      expect(await coordinationOn(valkey, 'host-b:3000').findGone(['cut-off'], true)).toEqual(new Set());
    });

    it('counts a missing heartbeat as gone in a sweep only once it has stayed missing past a renewal', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const valkey = new FakeValkey();
      const sweeper = coordinationOn(valkey, 'host-b:3000');
      expect(await sweeper.findGone(['a'], false)).toEqual(new Set());
      // Two sweeps close together (a slow one followed by a fast one) are not enough.
      jest.setSystemTime(Date.now() + 2_000);
      expect(await sweeper.findGone(['a'], false)).toEqual(new Set());
      jest.setSystemTime(Date.now() + 4_000);
      expect(await sweeper.findGone(['a'], false)).toEqual(new Set(['a']));
      // A live owner renews its heartbeat in between, so it is never removed.
      expect(await sweeper.findGone(['b'], false)).toEqual(new Set());
      coordinationOn(valkey).keepAlive('b');
      await flush();
      jest.setSystemTime(Date.now() + 10_000);
      expect(await sweeper.findGone(['b'], false)).toEqual(new Set());
    });

    it('removes nothing in a sweep when Valkey cannot be asked', async () => {
      const valkey = new FakeValkey();
      valkey.failing = true;
      expect(await coordinationOn(valkey).findGone(['a'], false)).toEqual(new Set());
    });

    it('at boot waits for an unreachable Valkey, then cleans up as the only instance', async () => {
      const valkey = new FakeValkey();
      valkey.failing = true;
      expect(await coordinationOn(valkey, 'host-a:3000', 50).findGone(['a'], true)).toEqual(new Set(['a']));
      setTimeout(() => {
        valkey.failing = false;
        coordinationOn(valkey, 'host-b:3000').keepAlive('b');
      }, 100);
      // Valkey answers within the wait: the live attempt of the other instance stays.
      expect(await coordinationOn(valkey, 'host-a:3000', 2_000).findGone(['b'], true)).toEqual(new Set());
    });
  });
});

describe('LocalSessionChangeCoordination', () => {
  it('only knows the attempts of this process', async () => {
    const local = new LocalSessionChangeCoordination();
    const stop = local.keepAlive('a');
    expect(await local.findGone(['a', 'b'], true)).toEqual(new Set(['b']));
    stop();
    expect(await local.findGone(['a'], false)).toEqual(new Set(['a']));
  });
});
describe('SessionChangeQueue across API instances', () => {
  it('serializes changes of two instances on one machine and times out the second one after its wait', async () => {
    const valkey = new FakeValkey();
    const instanceA = new SessionChangeQueue();
    const instanceB = new SessionChangeQueue();
    const log: string[] = [];
    let finishA!: () => void;
    const a = instanceA.run(
      1,
      async () => {
        log.push('a:start');
        await new Promise<void>((resolve) => (finishA = resolve));
        log.push('a:end');
      },
      1000,
      coordinationOn(valkey),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const impatient = instanceB.run(1, async () => 'b', 150, coordinationOn(valkey, 'host-b:3000'));
    await expect(impatient).rejects.toBeInstanceOf(MachineBusyError);
    const patient = instanceB.run(
      1,
      async () => {
        log.push('b');
      },
      2000,
      coordinationOn(valkey, 'host-b:3000'),
    );
    setTimeout(() => finishA(), 100);
    await Promise.all([a, patient]);
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });

  it('counts the in-process wait and the Valkey wait against one limit', async () => {
    const valkey = new FakeValkey();
    const queue = new SessionChangeQueue();
    // Another instance holds the machine in Valkey the whole time.
    const heldElsewhere = await coordinationOn(valkey, 'host-b:3000').acquire(1, 100);
    // A change of this instance holds its queue for 150 ms (it needs no lock for this test).
    void queue.run(1, () => new Promise<void>((resolve) => setTimeout(resolve, 150)), 1000);
    const startedAt = Date.now();
    await expect(queue.run(1, async () => 'x', 250, coordinationOn(valkey))).rejects.toBeInstanceOf(MachineBusyError);
    // 150 ms in the queue plus the remaining 100 ms for the lock, not another full 250 ms.
    const waited = Date.now() - startedAt;
    expect(waited).toBeGreaterThanOrEqual(240);
    expect(waited).toBeLessThan(350);
    await heldElsewhere();
  });
});
