import { UPGRADE_DOCS_URL } from '../backend/database-type';
import { SqliteTransferError, safeDetail } from './transfer-errors';

describe('transfer errors', () => {
  it('names the failed step, promises an untouched file and no partial import, and links the upgrade docs', () => {
    const error = new SqliteTransferError('importing into PostgreSQL', 'a table is missing');
    expect(error.name).toBe('SqliteTransferError');
    expect(error.step).toBe('importing into PostgreSQL');
    expect(error.message).toContain('failed while importing into PostgreSQL: a table is missing');
    expect(error.message).toContain('The SQLite file is untouched');
    expect(error.message).toContain('no partial import');
    expect(error.message).toContain(UPGRADE_DOCS_URL);
  });

  it('keeps the cause', () => {
    const cause = new Error('boom');
    expect(new SqliteTransferError('x', 'y', { cause }).cause).toBe(cause);
  });

  it('shows only the class and message of an error, never row values a driver may quote', () => {
    expect(safeDetail(new Error('plain'))).toBe('plain');
    class QueryFailedError extends Error {
      name = 'QueryFailedError';
    }
    expect(safeDetail(new QueryFailedError('duplicate key'))).toBe('QueryFailedError: duplicate key');
    expect(safeDetail('a string')).toBe('unknown error');
    expect(safeDetail(undefined)).toBe('unknown error');
  });
});
