import { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableAudit1783700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "audit_log" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "at" datetime NOT NULL, "domain" varchar NOT NULL, "pluginId" varchar NOT NULL,
      "action" varchar NOT NULL, "operationId" varchar NOT NULL, "actorId" integer NOT NULL,
      "authenticationMethod" varchar NOT NULL, "apiTokenId" integer,
      "outcome" varchar NOT NULL, "subjectType" varchar NOT NULL, "subjectId" integer NOT NULL,
      "details" text NOT NULL CHECK(length(CAST("details" AS BLOB)) <= 4096)
    )`);
    await runner.query('CREATE INDEX "IDX_audit_log_at" ON "audit_log" ("at")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_id" ON "audit_log" ("domain", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_actor_id" ON "audit_log" ("actorId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_subject_id" ON "audit_log" ("subjectId", "subjectType", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_operation_id" ON "audit_log" ("operationId", "id")');
    await runner.query('CREATE INDEX "IDX_audit_log_domain_at" ON "audit_log" ("domain", "at")');
    await runner.query(`CREATE TRIGGER "audit_log_no_update" BEFORE UPDATE ON "audit_log"
      BEGIN SELECT RAISE(ABORT, 'Audit rows are immutable'); END`);
    await runner.query(`INSERT INTO "permission" ("key", "label", "description", "category")
      VALUES ('system.audit.read', 'Read audit log', 'Read retained administration audit events', 'system')`);
    await runner.query(`INSERT INTO "role_permission" ("roleId", "permissionKey")
      SELECT "id", 'system.audit.read' FROM "role" WHERE "key" = 'administrator'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DELETE FROM "api_token_permission" WHERE "permissionKey" = 'system.audit.read'`);
    await runner.query(`DELETE FROM "role_permission" WHERE "permissionKey" = 'system.audit.read'`);
    await runner.query(`DELETE FROM "permission" WHERE "key" = 'system.audit.read'`);
    await runner.query('DROP TABLE "audit_log"');
  }
}
