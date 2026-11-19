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
    expect(error.message).toContain('the next start retries');
    expect(error.message).toContain(UPGRADE_DOCS_URL);
    expect(error.outcome).toBe('rolled-back');
  });

  it('says that prepared plugin storage tables stay and are reused', () => {
    const error = new SqliteTransferError('importing into PostgreSQL', 'boom', { outcome: 'plugin-storage-kept' });
    expect(error.message).toBe(
      'Transferring the SQLite data to PostgreSQL failed while importing into PostgreSQL: boom. The SQLite file is ' +
        'untouched and no data was imported into PostgreSQL; the empty storage tables of installed plugins may ' +
        `already exist there and are reused when the transfer runs again; the next start retries. See ${UPGRADE_DOCS_URL}.`,
    );
  });

  it('words the retry for the command, and promises no retry for a refusal', () => {
    const failed = new SqliteTransferError('importing into PostgreSQL', 'boom');
    expect(failed.describe('command')).toContain('no partial import; run the command again once the cause is fixed.');
    expect(failed.describe('command')).not.toContain('next start');
    expect(failed.describe('startup')).toBe(failed.message);

    const refused = new SqliteTransferError('checking the target', 'pass --force', { outcome: 'refused' });
    for (const text of [refused.message, refused.describe('command')]) {
      expect(text).toBe(
        'Transferring the SQLite data to PostgreSQL failed while checking the target: pass --force. Nothing was ' +
          `changed: neither the SQLite file nor the PostgreSQL database. See ${UPGRADE_DOCS_URL}.`,
      );
    }
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
