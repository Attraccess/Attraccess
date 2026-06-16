import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceHealthSystemSource1781700000000 implements MigrationInterface {
  name = 'ResourceHealthSystemSource1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableRows = await queryRunner.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'resource_health_state'`,
    );
    const createSql = String(tableRows[0]?.sql ?? '');
    const hasSourceCheck = /"source"\s+varchar\s+CHECK/i.test(createSql);

    if (!hasSourceCheck || createSql.includes(`'system'`)) {
      return;
    }

    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    await queryRunner.query(
      `CREATE TABLE "temporary_resource_health_state" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "identifier" text NOT NULL DEFAULT (''), "status" varchar NOT NULL DEFAULT ('healthy'), "reason" text, "source" varchar CHECK( "source" IN ('payload','heartbeat','manual','system') ) NOT NULL DEFAULT ('manual'), "lastReportedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_resource_health_resource_identifier" UNIQUE ("resourceId", "identifier"), CONSTRAINT "FK_resource_health_state_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_resource_health_state"("id", "resourceId", "identifier", "status", "reason", "source", "lastReportedAt", "createdAt", "updatedAt") SELECT "id", "resourceId", "identifier", "status", "reason", "source", "lastReportedAt", "createdAt", "updatedAt" FROM "resource_health_state"`,
    );
    await queryRunner.query(`DROP TABLE "resource_health_state"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_health_state" RENAME TO "resource_health_state"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_health_resource" ON "resource_health_state" ("resourceId")`,
    );
    await queryRunner.query(`PRAGMA foreign_keys = ON`);
  }

  public async down(): Promise<void> {
    // Existing rows may legitimately contain source='system'; keeping the widened constraint is the safe rollback.
  }
}
