import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DATABASE_SETTINGS_DOCS_URL, type PostgresConfig } from './postgres-config';
import { postgresErrorClassifier } from './postgres-errors';
import {
  initializeWithRetry,
  POSTGRES_CONNECT_TIMEOUT_MS,
  postgresConnectionOptions,
  waitForPostgres,
} from './postgres-connection';

const SECRET_URL = 'postgres://someone:hunter2@db.internal:5432/attraccess';
const config = { url: SECRET_URL, ssl: 'off', poolMax: 1, schema: 'public' } as PostgresConfig;
const coded = (code: string) => Object.assign(new Error('failed'), { code });

describe('postgres startup retry', () => {
  let warn: jest.SpyInstance;
  const sleep = jest.fn(async (_ms: number) => undefined);
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

    it('retries a connection the proxy of a starting container dropped (no error code)', async () => {
      const { source, initialize } = sourceFailing([
        new Error('Connection terminated unexpectedly'),
        new Error('Connection terminated due to connection timeout'),
      ]);
      await expect(initializeWithRetry(source, { sleep })).resolves.toBe(source);
      expect(initialize).toHaveBeenCalledTimes(3);
    });

    it('retries a new connection that missed the connect timeout while PostgreSQL boots, and only that', async () => {
      // pg-pool's message when establishing a new client exceeds connectionTimeoutMillis.
      const { source, initialize } = sourceFailing([new Error('Connection terminated due to connection timeout')]);
      await expect(initializeWithRetry(source, { sleep })).resolves.toBe(source);
      expect(initialize).toHaveBeenCalledTimes(2);
      // An exhausted pool is a runtime condition (busy), not a starting server: startup does not wait it out.
      const exhausted = new Error('timeout exceeded when trying to connect');
      expect(postgresErrorClassifier.classify(exhausted)).toBe('busy');
      const failing = sourceFailing([exhausted]);
      await expect(initializeWithRetry(failing.source, { sleep })).rejects.toBe(exhausted);
      expect(failing.initialize).toHaveBeenCalledTimes(1);
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
      const failure = coded('28000');
      const connect = jest.fn().mockRejectedValue(failure);
      await expect(waitForPostgres(config, { connect, sleep })).rejects.toBe(failure);
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['28P01', 'DATABASE_URL must use the password the PostgreSQL volume was created with'],
      ['3D000', 'The database named in DATABASE_URL does not exist'],
    ])('explains %s once, with the settings reference and without the URL', async (code, hint) => {
      const failure = Object.assign(new Error('password authentication failed for user "someone"'), { code });
      const connect = jest.fn().mockRejectedValue(failure);

      const error = await waitForPostgres(config, { connect, sleep }).catch((e) => e);

      expect(connect).toHaveBeenCalledTimes(1);
      expect(error.message).toContain(hint);
      expect(error.message).toContain(`(SQLSTATE ${code})`);
      expect(error.message).toContain(DATABASE_SETTINGS_DOCS_URL);
      expect(error.message).not.toContain('hunter2');
      expect(error.message).not.toContain('db.internal');
      expect(error.code).toBe(code);
      expect(error.cause).toBe(failure);
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

  describe('postgresConnectionOptions', () => {
    const startupOptions = (schema: string) =>
      String((postgresConnectionOptions({ ...config, schema }) as { extra: { options: string } }).extra.options);

    it('puts the session in the configured schema so unqualified DDL (baseline, triggers, plugin storage) lands there', () => {
      expect(startupOptions('qa_schema')).toContain('-c search_path="qa_schema"');
      expect(startupOptions('QaMixed')).toContain('-c search_path="QaMixed"');
      expect(startupOptions('public')).toContain('-c search_path="public"');
    });

    it('bounds the wait for a pooled or new connection instead of hanging forever', () => {
      const options = postgresConnectionOptions(config) as { connectTimeoutMS?: number; extra: { options: string } };
      expect(options.connectTimeoutMS).toBe(POSTGRES_CONNECT_TIMEOUT_MS);
      expect(POSTGRES_CONNECT_TIMEOUT_MS).toBe(10_000);
      // No statement_timeout: long reports and migrations must not be cut off.
      expect(options.extra.options).not.toContain('statement_timeout');
    });

    it('keeps the UTC session and the lock timeouts', () => {
      expect(startupOptions('public')).toMatch(
        /-c timezone=UTC -c lock_timeout=\d+ -c idle_in_transaction_session_timeout=\d+/,
      );
    });
  });
});
