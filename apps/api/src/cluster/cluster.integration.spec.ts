import Redis from 'ioredis';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PluginBleError } from '@attraccess/plugins-backend-sdk';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { ClusterService } from './cluster.service';
import { ClusterInstanceGoneError, ClusterRequestTimeoutError } from './cluster-errors';
import { ValkeyClusterInstances } from './cluster-instances';
import { ValkeyClusterDeadlines } from './cluster-deadlines';
import { ValkeyReaderPresence } from './reader-presence';

jest.setTimeout(90_000);

const FAST = { heartbeatEveryMs: 200, sweepEveryMs: 200, deadlineSweepEveryMs: 50 };

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The cluster building blocks against a real Valkey, with several ClusterServices standing in for API instances. */
describe('cluster coordination against Valkey (ATT-1163)', () => {
  let container: StartedTestContainer;
  const clients: Redis[] = [];
  const clusters: ClusterService[] = [];

  const client = () => {
    const created = new Redis(container.getMappedPort(6379), container.getHost());
    clients.push(created);
    return created;
  };
  const instance = async (name: string) => {
    const cluster = new ClusterService(client(), { instanceName: name, timing: FAST });
    cluster.onModuleInit();
    clusters.push(cluster);
    await cluster.whenReady();
    return cluster;
  };

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
  });

  afterEach(async () => {
    await Promise.all(clusters.splice(0).map((cluster) => cluster.onApplicationShutdown()));
    clients.splice(0).forEach((created) => created.disconnect());
    const admin = new Redis(container.getMappedPort(6379), container.getHost());
    await admin.flushall();
    admin.disconnect();
  });

  afterAll(async () => {
    await container?.stop();
  });

  describe('bus', () => {
    it('broadcasts to the other instances only and answers addressed requests', async () => {
      const a = await instance('a');
      const b = await instance('b');
      const c = await instance('c');
      const seen: string[] = [];
      for (const [name, cluster] of [
        ['a', a],
        ['b', b],
        ['c', c],
      ] as const) {
        cluster.bus.on(
          'hello',
          (payload, from) => void seen.push(`${name}<-${from === a.instanceId ? 'a' : '?'}:${payload}`),
        );
      }
      b.bus.handle('double', (payload) => (payload as number) * 2);

      await a.bus.broadcast('hello', 'x');
      await waitFor(() => seen.length === 2);
      expect(seen.sort()).toEqual(['b<-a:x', 'c<-a:x']);
      await expect(a.bus.request(b.instanceId, 'double', 21, 2_000)).resolves.toBe(42);
    });

    it('brings errors back as their own class', async () => {
      const a = await instance('a');
      const b = await instance('b');
      b.bus.handle('busy', () => {
        throw new ConflictException('The selected reader is busy with another operation');
      });
      b.bus.handle('missing', () => {
        throw new NotFoundException('NO_MASS_INTRODUCTION_IN_PROGRESS');
      });
      b.bus.handle('ble', () => {
        throw new PluginBleError('READER_BUSY', 'busy', { operation: 'scan' });
      });

      await expect(a.bus.request(b.instanceId, 'busy', null, 2_000)).rejects.toThrow(ConflictException);
      const missing = await a.bus.request(b.instanceId, 'missing', null, 2_000).catch((error: Error) => error);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((missing as Error).message).toBe('NO_MASS_INTRODUCTION_IN_PROGRESS');
      const ble = await a.bus.request(b.instanceId, 'ble', null, 2_000).catch((error: Error) => error);
      expect(ble).toBeInstanceOf(PluginBleError);
      expect((ble as PluginBleError).code).toBe('READER_BUSY');
    });

    it('times out a request nobody answers, and fails it at once when the instance is gone', async () => {
      const a = await instance('a');
      await expect(a.bus.request('nobody|x', 'anything', null, 300)).rejects.toBeInstanceOf(ClusterRequestTimeoutError);

      const b = await instance('b');
      b.bus.handle('slow', () => new Promise(() => undefined));
      const pending = a.bus.request(b.instanceId, 'slow', null, 60_000);
      b.halt();
      await client().del(`attraccess:cluster:alive:${b.instanceId}`);
      await expect(pending).rejects.toBeInstanceOf(ClusterInstanceGoneError);
    });
  });

  describe('instances and presence', () => {
    it('lists live instances and cleans up after a crashed one exactly once', async () => {
      const a = await instance('a');
      const b = await instance('b');
      const crashed = await instance('crashed');
      await waitFor(async () => (await a.instances.live()).length === 3);

      crashed.presence.socketConnected(7, 's1');
      await waitFor(async () => (await a.presence.holders(7)).length === 1);
      expect((await b.presence.holders(7))[0].instanceId).toBe(crashed.instanceId);

      const lost: string[] = [];
      a.presence.onReaderLost((readerId) => void lost.push(`a:${readerId}`));
      b.presence.onReaderLost((readerId) => void lost.push(`b:${readerId}`));
      crashed.halt();
      await client().del(`attraccess:cluster:alive:${crashed.instanceId}`);

      await waitFor(() => lost.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(lost).toHaveLength(1);
      expect(await a.presence.holders(7)).toEqual([]);
      expect(await a.instances.live()).not.toContain(crashed.instanceId);
    });

    it('prefers the newest connection and drops a reader only when its last socket on an instance closes', async () => {
      const a = await instance('a');
      const b = await instance('b');
      a.presence.socketConnected(3, 'old');
      await new Promise((resolve) => setTimeout(resolve, 5));
      b.presence.socketConnected(3, 'new');
      await waitFor(async () => (await a.presence.holders(3)).length === 2);
      expect((await a.presence.holders(3)).map((holder) => holder.instanceId)).toEqual([b.instanceId, a.instanceId]);

      b.presence.socketConnected(3, 'second');
      b.presence.socketDisconnected(3, 'new');
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect((await a.presence.holders(3)).map((holder) => holder.instanceId)).toContain(b.instanceId);
      b.presence.socketDisconnected(3, 'second');
      await waitFor(async () => (await a.presence.holders(3)).length === 1);
    });

    it('does not judge an instance gone while its heartbeat is merely late (missing once)', async () => {
      const a = await instance('a');
      const valkey = client();
      const lonely = new ValkeyClusterInstances(valkey, 'lonely|1');
      await lonely.beat();
      const gone: string[] = [];
      const judge = new ValkeyClusterInstances(valkey, 'judge|1');
      judge.onGone((id) => void gone.push(id));
      await valkey.del('attraccess:cluster:alive:lonely|1');
      await judge.sweep();
      expect(gone).toEqual([]);
      await lonely.beat();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await judge.sweep();
      expect(gone).toEqual([]);
      expect(a.enabled).toBe(true);
    });

    it('rewrites lost presence on the next resync', async () => {
      const valkey = client();
      const a = await instance('a');
      a.presence.socketConnected(11, 's');
      await waitFor(async () => (await a.presence.holders(11)).length === 1);
      await valkey.del('attraccess:cluster:reader:11');
      await (a.presence as ValkeyReaderPresence).resync();
      const b = await instance('b');
      expect((await b.presence.holders(11)).map((holder) => holder.instanceId)).toEqual([a.instanceId]);
    });
  });

  describe('reader screen claims', () => {
    it('gives a reader to one flow at a time, cluster-wide, until released or expired', async () => {
      const a = await instance('a');
      const b = await instance('b');
      const results = await Promise.all([
        a.claims.claim(5, 'mass-introduction:1', 5_000),
        b.claims.claim(5, 'supervision:2', 5_000),
        b.claims.claim(5, 'enrollment:3', 5_000),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const owner = await a.claims.owner(5);
      // The holder may claim again (a retried arm); others still may not.
      expect(await b.claims.claim(5, owner as string, 5_000)).toBe(true);
      await b.claims.release(5, 'someone-else');
      expect(await a.claims.owner(5)).toBe(owner);
      await b.claims.release(5, owner as string);
      expect(await a.claims.claim(5, 'reset:4', 100)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await b.claims.claim(5, 'enrollment:5', 1_000)).toBe(true);
      expect(await a.claims.forceRelease(5)).toBe('enrollment:5');
      expect(await a.claims.owner(5)).toBeNull();
    });
  });

  describe('deadlines', () => {
    it('fires each deadline exactly once across instances, without keyspace notifications', async () => {
      const fired: string[] = [];
      const instances = await Promise.all(['a', 'b', 'c'].map((name) => instance(name)));
      instances.forEach((cluster, index) => cluster.deadlines.onDue('test', (id) => void fired.push(`${index}:${id}`)));
      const now = Date.now();
      for (let item = 0; item < 20; item++) await instances[0].deadlines.schedule('test', `item-${item}`, now + 200);
      await instances[1].deadlines.schedule('test', 'cancelled', now + 200);
      await instances[2].deadlines.cancel('test', 'cancelled');

      await waitFor(() => fired.length === 20);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(fired).toHaveLength(20);
      expect(new Set(fired.map((entry) => entry.split(':')[1])).size).toBe(20);
      expect(fired.some((entry) => entry.endsWith(':cancelled'))).toBe(false);
    });

    it('does not fire before the deadline', async () => {
      const deadlines = new ValkeyClusterDeadlines(client());
      const fired: string[] = [];
      deadlines.onDue('test', (id) => void fired.push(id));
      await deadlines.schedule('test', 'later', Date.now() + 10_000);
      await deadlines.sweep();
      expect(fired).toEqual([]);
      await deadlines.sweep(Date.now() + 10_001);
      expect(fired).toEqual(['later']);
    });
  });
});
