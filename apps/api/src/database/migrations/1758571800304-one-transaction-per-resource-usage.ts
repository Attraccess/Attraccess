import { MigrationInterface, QueryRunner } from 'typeorm';

export class OneTransactionPerResourceUsage1758571800304 implements MigrationInterface {
  name = 'OneTransactionPerResourceUsage1758571800304';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "UQ_1146d55f3c69b2b4c83d050b73d" UNIQUE ("resourceUsageId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "UQ_1146d55f3c69b2b4c83d050b73d" UNIQUE ("resourceUsageId"), CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "UQ_1146d55f3c69b2b4c83d050b73d" UNIQUE ("resourceUsageId"))`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);
    await queryRunner.query(`ALTER TABLE "billing_transaction" RENAME TO "temporary_billing_transaction"`);
    await queryRunner.query(
      `CREATE TABLE "billing_transaction" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer, "externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "billing_transaction"("id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status") SELECT "id", "userId", "createdAt", "updatedAt", "amount", "initiatorId", "resourceUsageId", "refundOfId", "externalReference", "status" FROM "temporary_billing_transaction"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_billing_transaction"`);
  }
}
