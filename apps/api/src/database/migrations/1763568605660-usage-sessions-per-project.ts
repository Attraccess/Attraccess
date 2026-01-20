import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsageSessionsPerProject1763568605660 implements MigrationInterface {
  name = 'UsageSessionsPerProject1763568605660';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('usage','door.lock','door.unlock','door.unlatch') ) NOT NULL, "projectId" integer, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction" FROM "resource_usage"`,
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
    await queryRunner.query(`CREATE TABLE "temporary_resource_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('usage','door.lock','door.unlock','door.unlatch') ) NOT NULL, "projectId" integer, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_2f4b0bc57bf05dd031831965d43" FOREIGN KEY ("projectId") REFERENCES "project" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
    await queryRunner.query(
      `INSERT INTO "temporary_resource_usage"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction", "projectId") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction", "projectId" FROM "resource_usage"`,
    );
    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "temporary_resource_usage" RENAME TO "resource_usage"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_insert"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_update"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_billing_transaction_balance_after_delete"`);

    await queryRunner.query(
      `CREATE TABLE "resource_usage_next" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "resourceId" integer NOT NULL, "userId" integer, "startTime" datetime NOT NULL DEFAULT (datetime('now')), "startNotes" text, "endTime" datetime, "endNotes" text, "usageInMinutes" integer NOT NULL AS (CASE 
      WHEN "endTime" IS NULL THEN -1
      ELSE (julianday("endTime") - julianday("startTime")) * 1440
    END) STORED, "usageAction" varchar CHECK( "usageAction" IN ('usage','door.lock','door.unlock','door.unlatch') ) NOT NULL, CONSTRAINT "FK_6f80e3fc0cf8bfce60e25a6805f" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_8177b2b424a6d31c533d57b95cc" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "resource_usage_next"("id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction") SELECT "id", "resourceId", "userId", "startTime", "startNotes", "endTime", "endNotes", "usageAction" FROM "resource_usage"`,
    );

    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "UQ_1146d55f3c69b2b4c83d050b73d" UNIQUE ("resourceUsageId"), CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage_next" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);

    await queryRunner.query(`DROP TABLE "resource_usage"`);
    await queryRunner.query(`ALTER TABLE "resource_usage_next" RENAME TO "resource_usage"`);

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_insert"
       AFTER INSERT ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId AND NEW.status = 'completed';
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_update"
       AFTER UPDATE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId
           AND OLD.status = 'completed'
           AND (
             OLD.userId != NEW.userId OR
             OLD.amount != NEW.amount OR
             OLD.status != NEW.status
           );

         UPDATE "user"
         SET creditBalance = creditBalance + NEW.amount,
             updatedAt = datetime('now')
         WHERE id = NEW.userId
           AND NEW.status = 'completed'
           AND (
             OLD.userId != NEW.userId OR
             OLD.amount != NEW.amount OR
             OLD.status != NEW.status
           );
       END`,
    );

    await queryRunner.query(
      `CREATE TRIGGER "trg_billing_transaction_balance_after_delete"
       AFTER DELETE ON "billing_transaction"
       BEGIN
         UPDATE "user"
         SET creditBalance = creditBalance - OLD.amount,
             updatedAt = datetime('now')
         WHERE id = OLD.userId AND OLD.status = 'completed';
       END`,
    );
  }
}
