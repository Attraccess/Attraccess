import { Logger } from '@nestjs/common';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveDatabasePath } from '../../../config/storage-path';
import { importSqliteInstallation } from './sqlite-import/import-sqlite';

/**
 * Moves an existing SQLite installation into PostgreSQL, right after the baseline created the schema that equals the
 * last SQLite schema. Without `<STORAGE_ROOT>/attraccess.sqlite` it does nothing. Later migrations then run on the
 * imported data like on any other database. Plugin data is not moved.
 *
 * It owns its transaction (the track runs with `migrationsTransactionMode: 'each'`): the copy commits before the
 * SQLite file moves to `<STORAGE_ROOT>/sqlite-backup/`, and a later migration that fails cannot roll it back.
 */
export class PostgresImportSqlite1760000000001 implements MigrationInterface {
  name = 'PostgresImportSqlite1760000000001';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await importSqliteInstallation(queryRunner, {
      sqliteFile: resolveDatabasePath(),
      logger: new Logger('SqliteImport'),
    });
  }

  public async down(): Promise<void> {
    // Irreversible: the SQLite file keeps the data in <STORAGE_ROOT>/sqlite-backup/.
  }
}
