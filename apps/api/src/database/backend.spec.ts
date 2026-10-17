import { resolveBackendConfig } from './backend.config';
import { selectDatabaseBackend } from './backend.registry';
import { sqliteSchema } from './sqlite/schema';
import { toApplicationRecord } from './sqlite/backend';
import { DataSource } from 'typeorm';

describe('database backend selection', () => {
  it.each([{}, { DATABASE_TYPE: 'sqlite' }])('retains SQLite storage defaults for %j', (env) => {
    expect(resolveBackendConfig(env, '/workspace')).toEqual({
      type: 'sqlite',
      database: '/workspace/storage/attraccess.sqlite',
    });
    const backend = selectDatabaseBackend(env, '/workspace');
    expect(backend.type).toBe('sqlite');
    expect(backend.capabilities).toEqual({ independentWriters: false, fileBacked: true });
    expect(backend.connectionOptions()).toEqual({
      ...sqliteSchema,
      type: 'sqlite',
      database: '/workspace/storage/attraccess.sqlite',
      synchronize: false,
      migrationsRun: true,
    });
  });

  it('uses the same configured storage root for CLI and runtime connections', () => {
    const backend = selectDatabaseBackend({ STORAGE_ROOT: './data' }, '/workspace');
    expect(backend.createConnection().options).toEqual(backend.connectionOptions());
    expect(backend.connectionOptions().database).toBe('/workspace/data/attraccess.sqlite');
  });

  it.each(['postgres', 'postgresql', 'unknown', '', 'SQLITE', ' sqlite', 'sqlite '])(
    'rejects unavailable selection %j before opening a connection',
    (type) => {
      const initialize = jest.spyOn(DataSource.prototype, 'initialize');
      try {
        expect(() => selectDatabaseBackend({ DATABASE_TYPE: type }, '/workspace')).toThrow(
          'Unsupported DATABASE_TYPE. This installation supports sqlite only.',
        );
        expect(initialize).not.toHaveBeenCalled();
      } finally {
        initialize.mockRestore();
      }
    },
  );

  it('copies loaded relations without ORM prototypes while retaining exact scalars and cycles', () => {
    class Row {
      id = 1;
      relation?: Row;
    }
    const row = new Row();
    row.relation = row;
    const date = new Date('2026-01-01T00:00:00Z');
    const binary = Buffer.from([0, 255]);
    const record = toApplicationRecord({ row, date, binary, nullable: null, precise: '9007199254740993.123' });
    expect(Object.getPrototypeOf(record.row)).toBe(Object.prototype);
    expect(record.row.relation).toBe(record.row);
    expect(record.date).toBe(date);
    expect(record.binary).toEqual(binary);
    expect(record.precise).toBe('9007199254740993.123');
    expect(record.nullable).toBeNull();
  });

  it('does not disclose untrusted configuration in errors', () => {
    expect(() => resolveBackendConfig({ DATABASE_TYPE: 'postgres://user:secret@host/database' })).toThrow(
      /^Unsupported DATABASE_TYPE\. This installation supports sqlite only\.$/,
    );
  });
});
