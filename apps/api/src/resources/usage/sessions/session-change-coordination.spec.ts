import { MachineBusyError } from '../errors/machine-busy.error';
import {
  LocalSessionChangeCoordination,
  RELEASE_LOCK_SCRIPT,
  RENEW_LOCK_SCRIPT,
  ValkeySessionChangeCoordination,
} from './session-change-coordination';
import { SessionChangeQueue } from './session-change-queue';

/** Just enough of Valkey for the lock: SET NX PX, EXISTS, DEL and the two compare-by-token scripts. */
class FakeValkey {
  readonly data = new Map<string, { value: string; expiresAt: number }>();
  failing = false;

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt <= Date.now()) this.data.delete(key);
    return this.data.get(key);
  }

  async set(key: string, value: string, _px: 'PX', ttl: number, nx?: 'NX') {
    if (this.failing) throw new Error('valkey down');
    if (nx && this.live(key)) return null;
    this.data.set(key, { value, expiresAt: Date.now() + ttl });
    return 'OK';
  }

  async eval(script: string, _keys: number, key: string, token: string, ttl?: number) {
    if (this.failing) throw new Error('valkey down');
    const entry = this.live(key);
    if (!entry || entry.value !== token) return 0;
    if (script === RELEASE_LOCK_SCRIPT) return this.data.delete(key) ? 1 : 0;
    if (script === RENEW_LOCK_SCRIPT) {
      entry.expiresAt = Date.now() + Number(ttl);
      return 1;
    }
    throw new Error('unknown script');
  }

  async exists(key: string) {
    if (this.failing) throw new Error('valkey down');
    return this.live(key) ? 1 : 0;
  }

  async del(key: string) {
    return this.data.delete(key) ? 1 : 0;
  }
}

const coordinationOn = (valkey: FakeValkey) => new ValkeySessionChangeCoordination(valkey as never);

describe('ValkeySessionChangeCoordination', () => {
  it('lets only one API instance hold a machine at a time', async () => {
    const valkey = new FakeValkey();
    const first = coordinationOn(valkey);
    const second = coordinationOn(valkey);
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
    const first = coordinationOn(valkey);
    const second = coordinationOn(valkey);
    const release = await first.acquire(1, 1000);
    const waiting = second.acquire(1, 2000);
    setTimeout(() => void release(), 100);
    await expect(waiting).resolves.toEqual(expect.any(Function));
  });

  it('frees the machine after the holder crashed (lock expires)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const valkey = new FakeValkey();
      const crashed = coordinationOn(valkey);
      await crashed.acquire(1, 1000);
      // No renewal and no release: the process is gone.
      jest.clearAllTimers();
      jest.setSystemTime(Date.now() + 16_000);
      await expect(coordinationOn(valkey).acquire(1, 100)).resolves.toEqual(expect.any(Function));
    } finally {
      jest.useRealTimers();
    }
  });

  it('never releases a lock that expired and was taken over by someone else', async () => {
    const valkey = new FakeValkey();
    const slow = coordinationOn(valkey);
    const release = await slow.acquire(1, 1000);
    const held = valkey.data.get('attraccess:session-change:lock:1');
    if (held) held.value = 'someone-else';
    await release();
    expect(valkey.data.get('attraccess:session-change:lock:1')?.value).toBe('someone-else');
  });

  it('falls back to this instance when Valkey is unreachable', async () => {
    const valkey = new FakeValkey();
    valkey.failing = true;
    const release = await coordinationOn(valkey).acquire(1, 100);
    await expect(release()).resolves.toBeUndefined();
  });

  it('shows attempts of other instances as alive until they stop or their heartbeat expires', async () => {
    const valkey = new FakeValkey();
    const owner = coordinationOn(valkey);
    const restarted = coordinationOn(valkey);
    const stop = owner.keepAlive('attempt-1');
    expect(await restarted.isAlive('attempt-1')).toBe(true);
    expect(await restarted.isAlive('attempt-2')).toBe(false);
    stop();
    expect(await restarted.isAlive('attempt-1')).toBe(false);
  });

  it('treats an attempt as orphaned when Valkey cannot be asked', async () => {
    const valkey = new FakeValkey();
    valkey.failing = true;
    expect(await coordinationOn(valkey).isAlive('attempt-1')).toBe(false);
  });
});

describe('LocalSessionChangeCoordination', () => {
  it('only knows the attempts of this process', async () => {
    const local = new LocalSessionChangeCoordination();
    const stop = local.keepAlive('a');
    expect(await local.isAlive('a')).toBe(true);
    stop();
    expect(await local.isAlive('a')).toBe(false);
    expect(await new LocalSessionChangeCoordination().isAlive('a')).toBe(false);
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
    const impatient = instanceB.run(1, async () => 'b', 150, coordinationOn(valkey));
    await expect(impatient).rejects.toBeInstanceOf(MachineBusyError);
    const patient = instanceB.run(
      1,
      async () => {
        log.push('b');
      },
      2000,
      coordinationOn(valkey),
    );
    setTimeout(() => finishA(), 100);
    await Promise.all([a, patient]);
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });

  it('counts the in-process wait and the Valkey wait against one limit', async () => {
    const valkey = new FakeValkey();
    const queue = new SessionChangeQueue();
    const other = coordinationOn(valkey);
    const heldElsewhere = await other.acquire(1, 100);
    const startedAt = Date.now();
    await expect(queue.run(1, async () => 'x', 200, coordinationOn(valkey))).rejects.toBeInstanceOf(MachineBusyError);
    expect(Date.now() - startedAt).toBeLessThan(400);
    await heldElsewhere();
    await expect(queue.run(1, async () => 'ok', 200, coordinationOn(valkey))).resolves.toBe('ok');
  });
});
