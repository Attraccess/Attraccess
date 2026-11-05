import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { MachineBusyError } from '../errors/machine-busy.error';
import { ValkeySessionChangeCoordination } from './session-change-coordination';
import { SessionChangeQueue } from './session-change-queue';

jest.setTimeout(90_000);

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
    const a = new ValkeySessionChangeCoordination(clientA);
    const b = new ValkeySessionChangeCoordination(clientB);
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

  it('keeps the lock alive past its TTL while the change runs, and lets it expire after a crash', async () => {
    const a = new ValkeySessionChangeCoordination(clientA);
    const release = await a.acquire(3, 1000);
    expect(await clientA.pttl('attraccess:session-change:lock:3')).toBeGreaterThan(0);
    await release();
    expect(await clientA.exists('attraccess:session-change:lock:3')).toBe(0);
    await clientA.set('attraccess:session-change:lock:3', 'crashed', 'PX', 200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await (
      await new ValkeySessionChangeCoordination(clientB).acquire(3, 100)
    )();
  });

  it('shows an attempt as alive to other instances only while its owner works on it', async () => {
    const owner = new ValkeySessionChangeCoordination(clientA);
    const other = new ValkeySessionChangeCoordination(clientB);
    const stop = owner.keepAlive('attempt-x');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await other.isAlive('attempt-x')).toBe(true);
    stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await other.isAlive('attempt-x')).toBe(false);
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
      new ValkeySessionChangeCoordination(clientA),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = new SessionChangeQueue().run(
      4,
      async () => {
        log.push('b');
      },
      3000,
      new ValkeySessionChangeCoordination(clientB),
    );
    setTimeout(() => finish(), 100);
    await Promise.all([first, second]);
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });
});
