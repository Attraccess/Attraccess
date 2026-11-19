import { MigrationInterface, QueryRunner } from 'typeorm';
import { EXTRA_TABLE_STATEMENTS } from './baseline/extra-tables';
import { SEED_TABLES } from './baseline/seed-data';
import { CONSTRAINT_STATEMENTS } from './baseline/schema-constraints';
import { INDEX_STATEMENTS } from './baseline/schema-indexes';
import { TABLE_STATEMENTS } from './baseline/schema-table-statements';
import { TYPE_STATEMENTS } from './baseline/schema-types';
import { TRIGGER_STATEMENTS } from './baseline/triggers';

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

/**
 * The PostgreSQL baseline: the complete schema equal to the final state of the 251 released SQLite migrations (tables,
 * indexes, partial indexes, constraints, balance and integrity triggers, seed rows). Every later schema change is a
 * migration after this one.
 */
export class PostgresBaseline1800000000000 implements MigrationInterface {
  name = 'PostgresBaseline1800000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statements of [
      TYPE_STATEMENTS,
      TABLE_STATEMENTS,
      EXTRA_TABLE_STATEMENTS,
      CONSTRAINT_STATEMENTS,
      INDEX_STATEMENTS,
      TRIGGER_STATEMENTS,
    ]) {
      for (const statement of statements) await queryRunner.query(statement);
    }
    for (const { table, columns, rows } of SEED_TABLES) {
      const names = columns.map(quote).join(', ');
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      for (const row of rows) {
        await queryRunner.query(`INSERT INTO ${quote(table)} (${names}) VALUES (${placeholders})`, [...row]);
      }
      // Seed rows carry explicit ids: the sequence continues after them.
      if (columns.includes('id')) {
        await queryRunner.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT COALESCE(MAX("id"), 1) FROM ${quote(table)}))`,
          [table],
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> 'migrations'`,
    );
    for (const { table_name: table } of tables) await queryRunner.query(`DROP TABLE IF EXISTS ${quote(table)} CASCADE`);
    const types: Array<{ typname: string }> = await queryRunner.query(
      `SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema() AND t.typtype = 'e'`,
    );
    for (const { typname } of types) await queryRunner.query(`DROP TYPE IF EXISTS ${quote(typname)} CASCADE`);
    for (const fn of [
      'audit_log_no_update_fn',
      'resource_usage_valid_open_fn',
      'resource_usage_single_active_fn',
      'billing_transaction_balance_fn',
    ]) {
      await queryRunner.query(`DROP FUNCTION IF EXISTS ${quote(fn)}() CASCADE`);
    }
  }
}
