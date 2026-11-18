import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { PostgresConfig } from './postgres-config';
import { initializeWithRetry, waitForPostgres } from './postgres-connection';

const SECRET_URL = 'postgres://someone:hunter2@db.internal:5432/attraccess';
const config = { url: SECRET_URL, ssl: 'off', poolMax: 1, schema: 'public' } as PostgresConfig;
const coded = (code: string) => Object.assign(new Error('failed'), { code });

describe('postgres startup retry', () => {
  let warn: jest.SpyInstance;
  const sleep = jest.fn(async () => undefined);
  beforeEach(() => {
    sleep.mockClear();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const sourceFailing = (errors: unknown[]) => {
    const initialize = jest.fn(async () => {
      if (errors.length > 0) throw errors.shift();
      return source;
    });
    const source = { initialize } as unknown as DataSource;
    return { source, initialize };
  };

  describe('initializeWithRetry', () => {
    it('retries transient failures with a growing, capped delay and then succeeds', async () => {
      const { source, initialize } = sourceFailing([
        coded('ECONNREFUSED'),
        coded('57P03'),
        coded('ENOTFOUND'),
        coded('EAI_AGAIN'),
        coded('ETIMEDOUT'),
        coded('ECONNRESET'),
        coded('53300'),
        coded('ECONNREFUSED'),
        coded('ECONNREFUSED'),
        coded('ECONNREFUSED'),
      ]);
      await expect(initializeWithRetry(source, { sleep })).resolves.toBe(source);
      expect(initialize).toHaveBeenCalledTimes(11);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500, 1000, 2000, 4000, 5000, 5000, 5000, 5000, 5000]);
      expect(warn).toHaveBeenCalledTimes(10);
    });

    it('recognises a transient code on the wrapped driver error', async () => {
      const { source } = sourceFailing([{ driverError: { code: 'ECONNREFUSED' } }]);
      await expect(initializeWithRetry(source, { sleep })).resolves.toBe(source);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('does not retry a configuration error', async () => {
      const failure = coded('28P01');
      const { source, initialize } = sourceFailing([failure]);
      await expect(initializeWithRetry(source, { sleep })).rejects.toBe(failure);
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('does not retry an error without a code', async () => {
      const failure = new Error('plain');
      const { source, initialize } = sourceFailing([failure]);
      await expect(initializeWithRetry(source, { sleep })).rejects.toBe(failure);
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it('gives up after the bounded number of attempts and rethrows the last error', async () => {
      const failure = coded('ECONNREFUSED');
      const { source, initialize } = sourceFailing(Array.from({ length: 10 }, () => failure));
      await expect(initializeWithRetry(source, { attempts: 3, sleep })).rejects.toBe(failure);
      expect(initialize).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('names the error class when there is no code', async () => {
      const error = new TypeError('x');
      const { source } = sourceFailing([error]);
      await expect(initializeWithRetry(source, { attempts: 1, sleep })).rejects.toBe(error);
    });
  });

  describe('waitForPostgres', () => {
    it('returns as soon as the connection works', async () => {
      const connect = jest.fn(async () => undefined);
      await waitForPostgres(config, { connect, sleep });
      expect(connect).toHaveBeenCalledWith(config);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('retries while PostgreSQL starts and never logs the URL', async () => {
      const connect = jest
        .fn()
        .mockRejectedValueOnce(coded('ECONNREFUSED'))
        .mockRejectedValueOnce(coded('57P03'))
        .mockResolvedValue(undefined);
      await waitForPostgres(config, { connect, sleep });
      expect(connect).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
      const logged = warn.mock.calls.map(([message]) => String(message)).join('\n');
      expect(logged).toContain('ECONNREFUSED');
      expect(logged).toContain('attempt 1/30');
      expect(logged).not.toContain('hunter2');
      expect(logged).not.toContain('db.internal');
    });

    it('does not retry a configuration error', async () => {
      const failure = coded('3D000');
      const connect = jest.fn().mockRejectedValue(failure);
      await expect(waitForPostgres(config, { connect, sleep })).rejects.toBe(failure);
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('gives up after the bounded attempts', async () => {
      const failure = coded('ETIMEDOUT');
      const connect = jest.fn().mockRejectedValue(failure);
      await expect(waitForPostgres(config, { attempts: 2, connect, sleep })).rejects.toBe(failure);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
    });

    it('reports the error class when the failure has no code', async () => {
      const connect = jest.fn().mockRejectedValue(new RangeError('x'));
      await expect(waitForPostgres(config, { connect, sleep })).rejects.toThrow('x');
    });
  });
});
