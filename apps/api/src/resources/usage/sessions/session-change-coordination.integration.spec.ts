import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { MachineBusyError } from '../errors/machine-busy.error';
import { LOCK_TTL_MS, RENEW_LOCK_SCRIPT, ValkeySessionChangeCoordination } from './session-change-coordination';
import { SessionChangeQueue } from './session-change-queue';

jest.setTimeout(90_000);

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** The lock scripts run against a real Valkey, with two clients standing in for two API instances. */
describe('session change coordination against Valkey', () => {
  let container: StartedTestContainer;
  let clientA: Redis;
  let clientB: Redis;

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:8-alpine').withExposedPorts(6379).start();
    clientA = new Redis(container.getMappedPort(6379), container.getHost());
    clientB = new Redis(container.getMappedPort(6379), container.getHost());
  });

  afterAll(async () => {
    clientA?.disconnect();
    clientB?.disconnect();
    await container?.stop();
  });

  it('gives a machine to one instance at a time and hands it over on release', async () => {
    const a = new ValkeySessionChangeCoordination(clientA, 'host-a:3000');
    const b = new ValkeySessionChangeCoordination(clientB, 'host-b:3000');
    const release = await a.acquire(1, 1000);
    await expect(b.acquire(1, 150)).rejects.toBeInstanceOf(MachineBusyError);
    const waiting = b.acquire(1, 3000);
    setTimeout(() => void release(), 100);
    await (
      await waiting
    )();
  });

  it('does not release a lock another holder took over', async () => {
    const a = new ValkeySessionChangeCoordination(clientA);
    const release = await a.acquire(2, 1000);
    await clientA.set('attraccess:session-change:lock:2', 'someone-else');
    await release();
    expect(await clientA.get('attraccess:session-change:lock:2')).toBe('someone-else');
    await clientA.del('attraccess:session-change:lock:2');
  });

  it('renews only its own lock, sets a vanished one again, and lets it expire after a crash', async () => {
    const key = 'attraccess:session-change:lock:3';
    await clientA.set(key, 'mine', 'PX', 1_000);
    expect(await clientA.eval(RENEW_LOCK_SCRIPT, 1, key, 'mine', LOCK_TTL_MS)).toBe(1);
    expect(await clientA.pttl(key)).toBeGreaterThan(1_000);
    await clientA.del(key);
    expect(await clientA.eval(RENEW_LOCK_SCRIPT, 1, key, 'mine', LOCK_TTL_MS)).toBe(1);
    expect(await clientA.get(key)).toBe('mine');
    expect(await clientA.eval(RENEW_LOCK_SCRIPT, 1, key, 'other', LOCK_TTL_MS)).toBe(0);
    expect(await clientA.get(key)).toBe('mine');
    await clientA.set(key, 'crashed', 'PX', 200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await (
      await new ValkeySessionChangeCoordination(clientB, 'host-b:3000').acquire(3, 100)
    )();
  });

  it('shows an attempt as alive to other instances only while its owner works on it', async () => {
    const owner = new ValkeySessionChangeCoordination(clientA, 'host-a:3000');
    const other = new ValkeySessionChangeCoordination(clientB, 'host-b:3000');
    const stop = owner.keepAlive('attempt-x');
    await waitFor(async () => (await clientB.exists('attraccess:session-change:alive:attempt-x')) === 1);
    expect(await other.findGone(['attempt-x'], true)).toEqual(new Set());
    // A restart of the owner recognises its own previous run.
    expect(await new ValkeySessionChangeCoordination(clientB, 'host-a:3000').findGone(['attempt-x'], true)).toEqual(
      new Set(['attempt-x']),
    );
    stop();
    await waitFor(async () => (await clientB.exists('attraccess:session-change:alive:attempt-x')) === 0);
    expect(await other.findGone(['attempt-x'], true)).toEqual(new Set(['attempt-x']));
  });

  it('serializes the changes of two instances through the queue', async () => {
    const log: string[] = [];
    let finish!: () => void;
    const first = new SessionChangeQueue().run(
      4,
      async () => {
        log.push('a:start');
        await new Promise<void>((resolve) => (finish = resolve));
        log.push('a:end');
      },
      2000,
      new ValkeySessionChangeCoordination(clientA, 'host-a:3000'),
    );
    await waitFor(async () => log.length === 1);
    const second = new SessionChangeQueue().run(
      4,
      async () => {
        log.push('b');
      },
      3000,
      new ValkeySessionChangeCoordination(clientB, 'host-b:3000'),
    );
    setTimeout(() => finish(), 100);
    await Promise.all([first, second]);
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });
});
