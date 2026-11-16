import { type ArgumentsHost, Logger } from '@nestjs/common';
import { BaseExceptionFilter, type HttpAdapterHost } from '@nestjs/core';
import { resolveDatabaseBackend } from '../database/backend';
import { SqliteReadonlyFilter } from './sqlite-readonly.filter';
resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' });
afterEach(() => jest.restoreAllMocks());
it.each([
  { code: 'SQLITE_READONLY', message: 'write failed' },
  { code: 'OTHER', message: 'SQLITE_READONLY: write failed' },
])('adds actionable storage guidance for read-only failures and delegates the original exception', (driver) => {
  const base = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const filter = new SqliteReadonlyFilter({ httpAdapter: {} } as HttpAdapterHost),
    host = {} as ArgumentsHost;
  // The shape of a failed statement: the driver's error with its code sits in driverError.
  const driverError = Object.assign(new Error(driver.message), { code: driver.code });
  const error = Object.assign(new Error(`${driver.code}: ${driver.message}`), { driverError, query: 'UPDATE fixture' });
  filter.catch(error, host);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('chown -R appuser:appuser /app/storage'));
  expect(base).toHaveBeenCalledWith(error, host);
});
it('delegates unrelated exceptions without misleading storage guidance', () => {
  const base = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const filter = new SqliteReadonlyFilter({ httpAdapter: {} } as HttpAdapterHost),
    host = {} as ArgumentsHost;
  const error = new Error('Unrelated failure');
  filter.catch(error, host);
  expect(log).not.toHaveBeenCalled();
  expect(base).toHaveBeenCalledWith(error, host);
});
