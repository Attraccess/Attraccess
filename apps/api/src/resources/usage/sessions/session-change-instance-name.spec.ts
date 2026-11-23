import { ConfigService } from '@nestjs/config';
import { MachineBusyError } from '../errors/machine-busy.error';
import { UsageSessionStore } from '../usage-session-store.port';
import { resolveInstanceName, ValkeySessionChangeCoordination } from './session-change-coordination';
import { SessionChangeTurns } from './session-change-turns';
import { FakeValkey } from './fake-valkey.test-fixture';

// Every instance in this file runs on the same host and port, so the default names collide.
const mockHostname = jest.fn(() => 'shared-host');
jest.mock('node:os', () => ({ ...jest.requireActual('node:os'), hostname: () => mockHostname() }));

const LOCK_1 = 'attraccess:session-change:lock:1';
const ALIVE = (id: string) => `attraccess:session-change:alive:${id}`;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const instance = (valkey: FakeValkey, override?: string) =>
  new ValkeySessionChangeCoordination(valkey as never, resolveInstanceName(override), 0);

describe('ATTRACCESS_INSTANCE_NAME', () => {
  const originalPort = process.env.PORT;
  beforeEach(() => {
    process.env.PORT = '3000';
    mockHostname.mockReturnValue('shared-host');
  });
  afterEach(() => {
    jest.useRealTimers();
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  describe('resolveInstanceName', () => {
    it('uses the trimmed override', () => {
      expect(resolveInstanceName('  replica-1 ')).toBe('replica-1');
    });

    it.each([undefined, '', '   '])('falls back to <hostname>:<PORT> for %p', (override) => {
      expect(resolveInstanceName(override)).toBe('shared-host:3000');
      delete process.env.PORT;
      expect(resolveInstanceName(override)).toBe('shared-host:3000');
      process.env.PORT = '3001';
      expect(resolveInstanceName(override)).toBe('shared-host:3001');
    });
  });

  describe('two instances on the same host and port', () => {
    it('take each other for their own previous run without the override', async () => {
      const valkey = new FakeValkey();
      const stop = instance(valkey).keepAlive('live');
      await flush();
      expect(await instance(valkey).findGone(['live'], true)).toEqual(new Set(['live']));
      stop();
    });

    it('leave each other`s live attempts alone with different names, at boot and in a sweep', async () => {
      const valkey = new FakeValkey();
      const stop = instance(valkey, 'replica-1').keepAlive('live');
      await flush();
      const other = instance(valkey, 'replica-2');
      expect(await other.findGone(['live'], true)).toEqual(new Set());
      expect(await other.findGone(['live'], false)).toEqual(new Set());
      stop();
    });

    it('do not release each other`s machine lock with different names', async () => {
      const valkey = new FakeValkey();
      const release = await instance(valkey, 'replica-1').acquire(1, 1000);
      const held = valkey.data.get(LOCK_1)?.value;
      await expect(instance(valkey, 'replica-2').acquire(1, 120)).rejects.toBeInstanceOf(MachineBusyError);
      expect(valkey.data.get(LOCK_1)?.value).toBe(held);
      await release();
    });
  });

  it('lets a recreated instance with the same name clear its previous run at once, on a new host name', async () => {
    const valkey = new FakeValkey();
    // The previous run's renewals live on fake timers, so switching back to real ones stops them: the process is gone.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const previous = instance(valkey, 'replica-1');
    previous.keepAlive('cut-off');
    await previous.acquire(1, 1000);
    jest.useRealTimers();
    mockHostname.mockReturnValue('recreated-host');
    const restarted = instance(valkey, 'replica-1');
    expect(await restarted.findGone(['cut-off'], true)).toEqual(new Set(['cut-off']));
    // Well before the lock's 15 s expiry: a lock it did not recognise as its own would make this throw MachineBusyError.
    await (
      await restarted.acquire(1, 100)
    )();
  });

  describe('SessionChangeTurns', () => {
    const store = {} as UsageSessionStore;
    const heartbeatOf = async (turns: SessionChangeTurns, valkey: FakeValkey) => {
      const stop = turns.coordination.keepAlive('x');
      await flush();
      const heartbeat = valkey.data.get(ALIVE('x'))?.value;
      stop();
      return heartbeat;
    };

    it('names its heartbeats after the configured instance name', async () => {
      const valkey = new FakeValkey();
      const config = new ConfigService({ valkey: { ATTRACCESS_INSTANCE_NAME: 'replica-7' } });
      expect(await heartbeatOf(new SessionChangeTurns(store, valkey as never, config), valkey)).toMatch(/^replica-7\|/);
    });

    it('names its heartbeats <hostname>:<PORT> without one', async () => {
      const valkey = new FakeValkey();
      const config = new ConfigService({ valkey: {} });
      expect(await heartbeatOf(new SessionChangeTurns(store, valkey as never, config), valkey)).toMatch(
        /^shared-host:3000\|/,
      );
      expect(await heartbeatOf(new SessionChangeTurns(store, valkey as never), valkey)).toMatch(/^shared-host:3000\|/);
    });
  });
});
