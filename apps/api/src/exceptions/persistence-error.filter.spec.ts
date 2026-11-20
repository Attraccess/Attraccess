import {
  type ArgumentsHost,
  BadRequestException,
  type ExceptionFilter,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { DATABASE_BUSY_MESSAGE } from '../database/persistence-errors';
import { INVALID_DATABASE_INPUT_MESSAGE, PersistenceErrorFilter } from './persistence-error.filter';
import { PersistenceReadOnlyFilter } from './persistence-read-only.filter';

// The shape of a failed statement: TypeORM's QueryFailedError carries the pg error (with its SQLSTATE) in driverError,
// and its message quotes the statement and the parameters.
const failedStatement = (code: string, message = 'value "9999999999" is out of range for type integer') =>
  Object.assign(new Error(message), {
    name: 'QueryFailedError',
    query: 'SELECT * FROM "resource" WHERE "id" = $1',
    parameters: ['9999999999'],
    driverError: Object.assign(new Error(message), { code }),
  });

describe('PersistenceErrorFilter', () => {
  const host = {} as ArgumentsHost;
  let next: jest.Mocked<ExceptionFilter>;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    next = { catch: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const answered = (exception: unknown) => {
    new PersistenceErrorFilter(next).catch(exception, host);
    expect(next.catch).toHaveBeenCalledTimes(1);
    expect(next.catch.mock.calls[0][1]).toBe(host);
    return next.catch.mock.calls[0][0];
  };

  it.each([
    ['a lock timeout', failedStatement('55P03', 'canceling statement due to lock timeout')],
    ['a statement timeout', { code: '57014' }],
    ['a serialization failure', failedStatement('40001', 'could not serialize access')],
    ['a deadlock', { driverError: { code: '40P01' } }],
    ['a lost connection', { code: '08006' }],
    ['an exhausted connection pool', new Error('timeout exceeded when trying to connect')],
  ])('answers 503 for %s', (_, exception) => {
    const answer = answered(exception);
    expect(answer).toBeInstanceOf(ServiceUnavailableException);
    expect((answer as ServiceUnavailableException).message).toBe(DATABASE_BUSY_MESSAGE);
  });

  it.each([
    ['a number out of range (an id past the integer column)', '22003'],
    ['malformed text for the column type', '22P02'],
    ['a NUL byte in a string', '22021'],
    ['a malformed date', '22007'],
    ['a date field overflow', '22008'],
  ])('answers 400 for %s without the driver message', (_, code) => {
    const answer = answered(failedStatement(code));
    expect(answer).toBeInstanceOf(BadRequestException);
    const body = JSON.stringify((answer as BadRequestException).getResponse());
    expect(body).toContain(INVALID_DATABASE_INPUT_MESSAGE);
    expect(body).not.toContain('9999999999');
    expect(body).not.toContain('resource');
  });

  it.each([
    ['an unclassified driver failure', failedStatement('23502', 'null value in column')],
    ['a unique violation (callers decide)', failedStatement('23505', 'duplicate key')],
    ['a read-only database (logged by the next filter)', { code: '25006' }],
    ['an application error', new Error('logic error')],
    ['an HTTP exception', new NotFoundException()],
    ['a message that only mentions a code', new Error('55P03 22003')],
    ['nothing', undefined],
  ])('leaves %s to the default handling unchanged', (_, exception) => {
    expect(answered(exception)).toBe(exception);
  });

  it('warns about a busy database at most once a minute', () => {
    const filter = new PersistenceErrorFilter(next);
    // Past any warning the tests above caused.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000);
    filter.catch({ code: '55P03' }, host);
    filter.catch({ code: '40001' }, host);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('503');
  });

  it('reaches the client as the status code through the default filter chain', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const reply = jest.fn();
    const adapterHost = { httpAdapter: { reply, isHeadersSent: () => false, end: jest.fn() } };
    const response = {};
    const httpHost = { getArgByIndex: (index: number) => (index === 1 ? response : undefined) } as ArgumentsHost;
    const filter = new PersistenceErrorFilter(new PersistenceReadOnlyFilter(adapterHost as unknown as HttpAdapterHost));

    filter.catch(failedStatement('22003'), httpHost);
    filter.catch(failedStatement('40P01', 'deadlock detected'), httpHost);
    filter.catch(failedStatement('23502', 'null value in column'), httpHost);

    expect(reply.mock.calls.map(([, , status]) => status)).toEqual([400, 503, 500]);
    expect(JSON.stringify(reply.mock.calls)).not.toContain('9999999999');
  });
});
