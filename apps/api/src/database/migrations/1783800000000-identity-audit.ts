import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdentityAudit1783800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TRIGGER "audit_log_no_update"');
    await runner.query('ALTER TABLE "audit_log" RENAME TO "audit_log_previous"');
    await runner.query(`CREATE TABLE "audit_log" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "at" datetime NOT NULL, "domain" varchar NOT NULL, "pluginId" varchar,
      "action" varchar NOT NULL, "operationId" varchar NOT NULL, "actorId" integer,
      "authenticationMethod" varchar, "apiTokenId" integer,
      "outcome" varchar NOT NULL, "subjectType" varchar NOT NULL, "subjectId" integer,
      "ipAddress" varchar, "userAgent" varchar,
      "details" text NOT NULL CHECK(length(CAST("details" AS BLOB)) <= 4096)
    )`);
    await runner.query(`INSERT INTO "audit_log" ("id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "details")
      SELECT "id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "details" FROM "audit_log_previous"`);
    await runner.query('DROP TABLE "audit_log_previous"');
    await runner.query('CREATE INDEX "IDX_audit_log_at" ON "audit_log" ("at")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_id" ON "audit_log" ("domain", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_actor_id" ON "audit_log" ("actorId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_subject_id" ON "audit_log" ("subjectId", "subjectType", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_operation_id" ON "audit_log" ("operationId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_at" ON "audit_log" ("domain", "at")');
    await runner.query(`CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log"
      BEGIN SELECT RAISE(ABORT, 'Audit rows are immutable'); END`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DELETE FROM "audit_log" WHERE "domain" = \'identity\'');
    await runner.query('DROP TRIGGER "audit_log_no_update"');
    await runner.query('ALTER TABLE "audit_log" RENAME TO "audit_log_identity"');
    await runner.query(`CREATE TABLE "audit_log" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "at" datetime NOT NULL, "domain" varchar NOT NULL, "pluginId" varchar NOT NULL,
      "action" varchar NOT NULL, "operationId" varchar NOT NULL, "actorId" integer NOT NULL,
      "authenticationMethod" varchar NOT NULL, "apiTokenId" integer,
      "outcome" varchar NOT NULL, "subjectType" varchar NOT NULL, "subjectId" integer NOT NULL,
      "details" text NOT NULL CHECK(length(CAST("details" AS BLOB)) <= 4096)
    )`);
    await runner.query(`INSERT INTO "audit_log" ("id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "details")
      SELECT "id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "details" FROM "audit_log_identity"`);
    await runner.query('DROP TABLE "audit_log_identity"');
    await runner.query('CREATE INDEX "IDX_audit_log_at" ON "audit_log" ("at")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_id" ON "audit_log" ("domain", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_actor_id" ON "audit_log" ("actorId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_subject_id" ON "audit_log" ("subjectId", "subjectType", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_operation_id" ON "audit_log" ("operationId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_at" ON "audit_log" ("domain", "at")');
    await runner.query(`CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log"
      BEGIN SELECT RAISE(ABORT, 'Audit rows are immutable'); END`);
  }
}
