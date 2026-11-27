import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ReplyError } from 'ioredis';
import { isValkeyUnavailableError, VALKEY_UNAVAILABLE_MESSAGE, valkeyUnavailableException } from './valkey-unavailable';

describe('isValkeyUnavailableError', () => {
  it.each([
    Object.assign(new Error('Reached the max retries per request limit (which is 3).'), {
      name: 'MaxRetriesPerRequestError',
    }),
    new Error('Connection is closed.'),
    new Error('Command timed out'),
    new Error('Valkey is reconnecting'),
    new Error('Valkey is close'),
    new Error('Valkey is end'),
    new Error('Valkey did not answer in time'),
  ])('matches "$message"', (error) => {
    expect(isValkeyUnavailableError(error)).toBe(true);
  });

  it.each([
    new ReplyError('NOSCRIPT No matching script'),
    new ReplyError('WRONGPASS invalid username-password pair'),
    new Error('Valkey is ready'),
    new Error('SQLITE_BUSY: database is locked'),
    new ServiceUnavailableException(VALKEY_UNAVAILABLE_MESSAGE),
    'Connection is closed.',
    undefined,
  ])('does not match %p', (error) => {
    expect(isValkeyUnavailableError(error)).toBe(false);
  });
});

describe('valkeyUnavailableException', () => {
  afterEach(() => jest.useRealTimers());

  it('answers 503, warning at most once a minute with the message only', () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = Object.assign(new Error('Connection is closed.'), {
      command: { name: 'auth', args: ['default', 'secret-password'] },
    });

    expect(valkeyUnavailableException(error)).toEqual(new ServiceUnavailableException(VALKEY_UNAVAILABLE_MESSAGE));
    valkeyUnavailableException(error);
    jest.advanceTimersByTime(59_000);
    valkeyUnavailableException(error);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Connection is closed.'));

    jest.advanceTimersByTime(1_000);
    valkeyUnavailableException(error);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-password');
    warn.mockRestore();
  });
});
