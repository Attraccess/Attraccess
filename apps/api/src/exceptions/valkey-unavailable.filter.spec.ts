import { type ArgumentsHost, type ExceptionFilter, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Redis, ReplyError } from 'ioredis';
import { Repository } from 'typeorm';
import type { User } from '@attraccess/database-entities';
import { TokenHashService } from '../encryption/token-hash.service';
import { ValkeySessionStore } from '../users-and-auth/auth/session-store/valkey.session-store';
import { unreachableValkeyUrl } from '../valkey/unreachable-valkey.test-fixture';
import { isValkeyUnavailableError, VALKEY_UNAVAILABLE_MESSAGE } from '../valkey/valkey-unavailable';
import { ValkeyUnavailableFilter } from './valkey-unavailable.filter';

describe('isValkeyUnavailableError', () => {
  it.each([
    Object.assign(new Error('Reached the max retries per request limit (which is 3).'), {
      name: 'MaxRetriesPerRequestError',
    }),
    new Error('Connection is closed.'),
    new Error('Valkey is reconnecting'),
    new Error('Valkey did not answer in time'),
  ])('matches "$message"', (error) => {
    expect(isValkeyUnavailableError(error)).toBe(true);
  });

  it.each([
    new ReplyError('NOSCRIPT No matching script'),
    new ReplyError('WRONGPASS invalid username-password pair'),
    new Error('Valkey is ready'),
    new Error('SQLITE_BUSY: database is locked'),
    'Connection is closed.',
    undefined,
  ])('does not match %p', (error) => {
    expect(isValkeyUnavailableError(error)).toBe(false);
  });
});

describe('ValkeyUnavailableFilter', () => {
  const host = {} as ArgumentsHost;
  let next: jest.Mocked<ExceptionFilter>;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    next = { catch: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('answers 503 for a session store command that could not reach Valkey, logging only the message', async () => {
    const client = new Redis(await unreachableValkeyUrl('secret-password'), { maxRetriesPerRequest: 3 });
    client.on('error', () => undefined);
    const store = new ValkeySessionStore(
      client,
      {} as Repository<User>,
      {
        hashToken: (token: string) => `hashed:${token}`,
      } as TokenHashService,
    );
    const error = await store.authenticateSession('some-session-token').catch((caught: unknown) => caught);
    client.disconnect();

    new ValkeyUnavailableFilter(next).catch(error, host);

    expect(next.catch).toHaveBeenCalledWith(new ServiceUnavailableException(VALKEY_UNAVAILABLE_MESSAGE), host);
    expect(next.catch.mock.calls[0][0]).toBeInstanceOf(ServiceUnavailableException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('max retries per request'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-password');
  });

  it('passes every other exception on unchanged', () => {
    const error = new ReplyError('NOSCRIPT No matching script');

    new ValkeyUnavailableFilter(next).catch(error, host);

    expect(next.catch).toHaveBeenCalledWith(error, host);
    expect(warn).not.toHaveBeenCalled();
  });
});
