import { MigrationInterface, QueryRunner } from 'typeorm';

export class RetirePasswordPolicyAudit1783900000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`INSERT INTO "setting" ("parent", "key", "value")
      VALUES ('audit', 'domains', '["resource","wago","identity"]')
      ON CONFLICT ("parent", "key") DO UPDATE SET "value" =
        CASE
          WHEN json_valid("setting"."value") AND json_type("setting"."value") = 'array'
            THEN json_insert("setting"."value", '$[#]', 'identity')
          ELSE '["resource","wago","identity"]'
        END
      WHERE NOT EXISTS (
        SELECT 1 FROM json_each("setting"."value") WHERE value = 'identity'
      )`);
    await runner.query(`INSERT INTO "audit_log" ("at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "ipAddress", "userAgent", "details")
      SELECT "at", 'identity', NULL,
        CASE "event"
          WHEN 'global_policy_updated' THEN 'identity.password_policy_updated'
          WHEN 'override_deleted' THEN 'identity.password_policy_override_deleted'
          ELSE 'identity.password_policy_override_updated'
        END,
        lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
        "actorId", NULL, NULL, 'succeeded', 'identity.password_policy', 1, "ip", "userAgent",
        json_object('migrationSource', 'password_policy_audit', 'role', "role", 'before', substr("before", 1, 1800), 'after', substr("after", 1, 1800), 'changedFields', substr("changedFields", 1, 256))
      FROM "password_policy_audit"`);
    await runner.query('DROP TABLE "password_policy_audit"');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "password_policy_audit" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "at" datetime NOT NULL DEFAULT (datetime('now')),
      "event" varchar(64) NOT NULL, "actorId" integer, "actorUsername" varchar(255), "ip" varchar(45),
      "userAgent" varchar(512), "requestId" varchar(128), "role" varchar(64), "before" text, "after" text, "changedFields" text
    )`);
    await runner.query('CREATE INDEX "IDX_password_policy_audit_at" ON "password_policy_audit" ("at")');
    await runner.query('CREATE INDEX "IDX_password_policy_audit_actor" ON "password_policy_audit" ("actorId")');
    await runner.query(`INSERT INTO "password_policy_audit" ("at", "event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "role", "before", "after", "changedFields")
      SELECT "at",
        CASE "action"
          WHEN 'identity.password_policy_updated' THEN 'global_policy_updated'
          WHEN 'identity.password_policy_override_deleted' THEN 'override_deleted'
          ELSE 'override_upserted'
        END,
        "actorId", NULL, "ipAddress", "userAgent", NULL,
        json_extract("details", '$.role'), json_extract("details", '$.before'), json_extract("details", '$.after'), json_extract("details", '$.changedFields')
      FROM "audit_log"
      WHERE "domain" = 'identity' AND "subjectType" = 'identity.password_policy'
        AND json_extract("details", '$.migrationSource') = 'password_policy_audit'
        AND "action" IN ('identity.password_policy_updated', 'identity.password_policy_override_updated', 'identity.password_policy_override_deleted')`);
    await runner.query(`DELETE FROM "audit_log"
      WHERE "domain" = 'identity' AND "subjectType" = 'identity.password_policy'
        AND json_extract("details", '$.migrationSource') = 'password_policy_audit'
        AND "action" IN ('identity.password_policy_updated', 'identity.password_policy_override_updated', 'identity.password_policy_override_deleted')`);
  }
}
