import { MigrationInterface, QueryRunner } from 'typeorm';

const BASE_COLUMNS = `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "amount" integer NOT NULL, "initiatorId" integer, "resourceUsageId" integer, "refundOfId" integer`;
const TAIL_COLUMNS = `"externalReference" text, "status" varchar CHECK( "status" IN ('pending','completed','failed') ) NOT NULL, CONSTRAINT "UQ_1146d55f3c69b2b4c83d050b73d" UNIQUE ("resourceUsageId"), CONSTRAINT "FK_4ba793103570a8ad8b214a61418" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_bc081ca206dc8583c3c88c7dd16" FOREIGN KEY ("initiatorId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_08e16fa731a38197b56fed4d04b" FOREIGN KEY ("resourceUsageId") REFERENCES "resource_usage" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a0a4f865c54aad3f2724298410c" FOREIGN KEY ("refundOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`;
const COPIED_COLUMNS = [
  'id',
  'userId',
  'createdAt',
  'updatedAt',
  'amount',
  'initiatorId',
  'resourceUsageId',
  'refundOfId',
  'externalReference',
  'status',
];

// SQLite cannot add a foreign key to an existing table, so the table is rebuilt and its balance triggers replayed.
async function rebuildBillingTransaction(queryRunner: QueryRunner, definition: string, columns: string[]) {
  const triggers: { sql: string }[] = await queryRunner.query(
    `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'billing_transaction'`,
  );
  const list = columns.map((column) => `"${column}"`).join(', ');
  await queryRunner.query(`CREATE TABLE "temporary_billing_transaction" (${definition})`);
  await queryRunner.query(
    `INSERT INTO "temporary_billing_transaction"(${list}) SELECT ${list} FROM "billing_transaction"`,
  );
  await queryRunner.query('DROP TABLE "billing_transaction"');
  await queryRunner.query('ALTER TABLE "temporary_billing_transaction" RENAME TO "billing_transaction"');
  for (const { sql } of triggers) await queryRunner.query(sql);
}

export class EnergyMetering1790000000000 implements MigrationInterface {
  name = 'EnergyMetering1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "resource_billing_configuration" ADD "creditsPerKwh" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query('ALTER TABLE "resource_usage" ADD "energyCreditsPerKwh" integer');
    await rebuildBillingTransaction(
      queryRunner,
      `${BASE_COLUMNS}, "correctionOfId" integer, ${TAIL_COLUMNS}, CONSTRAINT "FK_billing_transaction_correction_of" FOREIGN KEY ("correctionOfId") REFERENCES "billing_transaction" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      COPIED_COLUMNS,
    );
    await queryRunner.query('ALTER TABLE "billing_transaction_item" ADD "energyMicroWh" varchar');
    await queryRunner.query('ALTER TABLE "billing_transaction_item" ADD "energyCreditsPerKwh" integer');
    await queryRunner.query(`CREATE TABLE "resource_metering_session" (
      "id" varchar PRIMARY KEY NOT NULL,
      "resourceId" integer NOT NULL,
      "usageId" integer NOT NULL,
      "status" varchar NOT NULL,
      "creditsPerKwh" integer NOT NULL,
      "baselineMicroWh" varchar,
      "source" varchar,
      "latestMicroWh" varchar,
      "latestObservedAt" datetime,
      "consumedMicroWh" varchar,
      "chargeCredits" integer,
      "finalOperationId" varchar,
      "failureReason" text,
      "compromisedReason" text,
      "settledAt" datetime,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT "FK_resource_metering_session_resource" FOREIGN KEY ("resourceId")
        REFERENCES "resource" ("id") ON DELETE CASCADE,
      CONSTRAINT "FK_resource_metering_session_usage" FOREIGN KEY ("usageId")
        REFERENCES "resource_usage" ("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_resource_metering_session_usage" ON "resource_metering_session" ("usageId")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_resource_metering_session_resource" ON "resource_metering_session" ("resourceId")',
    );
    await queryRunner.query(`CREATE TABLE "resource_metering_operation" (
      "id" varchar PRIMARY KEY NOT NULL,
      "sessionId" varchar NOT NULL,
      "resourceId" integer NOT NULL,
      "kind" varchar NOT NULL,
      "status" varchar NOT NULL,
      "requestedAt" datetime NOT NULL,
      "completedAt" datetime,
      "totalMicroWh" varchar,
      "observedAt" datetime,
      "source" varchar,
      "error" text,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT "FK_resource_metering_operation_session" FOREIGN KEY ("sessionId")
        REFERENCES "resource_metering_session" ("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_resource_metering_operation_session" ON "resource_metering_operation" ("sessionId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "resource_metering_operation"');
    await queryRunner.query('DROP TABLE "resource_metering_session"');
    await rebuildBillingTransaction(queryRunner, `${BASE_COLUMNS}, ${TAIL_COLUMNS}`, COPIED_COLUMNS);
    await queryRunner.query('ALTER TABLE "billing_transaction_item" DROP COLUMN "energyCreditsPerKwh"');
    await queryRunner.query('ALTER TABLE "billing_transaction_item" DROP COLUMN "energyMicroWh"');
    await queryRunner.query('ALTER TABLE "resource_usage" DROP COLUMN "energyCreditsPerKwh"');
    await queryRunner.query('ALTER TABLE "resource_billing_configuration" DROP COLUMN "creditsPerKwh"');
  }
}
