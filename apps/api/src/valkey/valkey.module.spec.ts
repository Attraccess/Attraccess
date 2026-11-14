import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ValkeyClientService } from './valkey.module';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

// A bare EventEmitter throws on an `error` nobody listens to, like ioredis' "Unhandled error event".
class FakeRedis extends EventEmitter {}

const VALKEY_URL = 'redis://default:secret-password@valkey:6379';

describe('ValkeyClientService', () => {
  const RedisMock = jest.mocked(Redis);
  let fake: FakeRedis;
  let loggerCalls: Record<'log' | 'warn' | 'error' | 'debug' | 'verbose', jest.SpyInstance>;

  const createService = (valkey: { VALKEY_URL?: string } | null = { VALKEY_URL }) =>
    new ValkeyClientService({ get: jest.fn(() => valkey ?? undefined) } as unknown as ConfigService);

  const lines = (level: keyof typeof loggerCalls) => loggerCalls[level].mock.calls;

  beforeEach(() => {
    fake = new FakeRedis();
    RedisMock.mockReset();
    RedisMock.mockImplementation(() => fake as unknown as Redis);
    loggerCalls = {
      log: jest.spyOn(Logger.prototype, 'log').mockImplementation(),
      warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
      error: jest.spyOn(Logger.prototype, 'error').mockImplementation(),
      debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(),
      verbose: jest.spyOn(Logger.prototype, 'verbose').mockImplementation(),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates no client without VALKEY_URL', () => {
    expect(createService({}).client).toBeNull();
    expect(createService(null).client).toBeNull();
    expect(RedisMock).not.toHaveBeenCalled();
    for (const spy of Object.values(loggerCalls)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('creates the client with the unchanged URL and options and listens for errors right away', () => {
    const service = createService();

    expect(service.client).toBe(fake);
    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith(VALKEY_URL, {
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
    expect(fake.listenerCount('error')).toBe(1);
    expect(() => fake.emit('error', new Error('connect ECONNREFUSED'))).not.toThrow();
  });

  it('logs "Connected to Valkey" once on the initial ready and no reconnected line', () => {
    createService();

    fake.emit('connect');
    fake.emit('ready');
    fake.emit('ready');

    expect(lines('log')).toEqual([['Connected to Valkey']]);
    expect(loggerCalls.log.mock.contexts[0]).toMatchObject({ context: ValkeyClientService.name });
    expect(loggerCalls.warn).not.toHaveBeenCalled();
  });

  it('warns once per outage, never at error level, and logs one line when it reconnects', () => {
    createService();
    fake.emit('ready');
    loggerCalls.log.mockClear();

    fake.emit('error', new Error('connect ECONNREFUSED'));
    fake.emit('connect');
    fake.emit('error', new Error('connect ECONNREFUSED'));
    fake.emit('error', new Error('connect ECONNREFUSED'));
    expect(lines('warn')).toEqual([['Lost connection to Valkey (connect ECONNREFUSED); retrying']]);
    expect(loggerCalls.log).not.toHaveBeenCalled();

    fake.emit('ready');
    fake.emit('ready');
    expect(lines('log')).toEqual([['Reconnected to Valkey']]);

    fake.emit('error', new Error('connect ECONNREFUSED'));
    fake.emit('error', new Error('connect ECONNREFUSED'));
    expect(loggerCalls.warn).toHaveBeenCalledTimes(2);
    expect(loggerCalls.error).not.toHaveBeenCalled();
  });

  it('logs "Reconnected to Valkey" and not "Connected to Valkey" when Valkey is unreachable at startup', () => {
    createService();

    fake.emit('error', new Error('connect ECONNREFUSED'));
    fake.emit('error', new Error('connect ECONNREFUSED'));
    fake.emit('ready');

    expect(loggerCalls.warn).toHaveBeenCalledTimes(1);
    expect(lines('log')).toEqual([['Reconnected to Valkey']]);
  });

  it('logs the error message without the AUTH password, or the code when the message is empty', () => {
    createService();

    fake.emit(
      'error',
      Object.assign(new Error('WRONGPASS invalid username-password pair'), {
        command: { name: 'auth', args: ['default', 'secret-password'] },
      }),
    );
    fake.emit('ready');
    fake.emit('error', Object.assign(new AggregateError([]), { code: 'ECONNREFUSED' }));

    expect(lines('warn')).toEqual([
      [expect.stringContaining('(WRONGPASS invalid username-password pair)')],
      [expect.stringContaining('(ECONNREFUSED)')],
    ]);
    for (const spy of Object.values(loggerCalls)) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-password');
    }
    expect(loggerCalls.error).not.toHaveBeenCalled();
  });
});
