import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnergyMetering1790000000000 implements MigrationInterface {
  name = 'EnergyMetering1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "resource_billing_configuration" ADD "creditsPerKwh" integer NOT NULL DEFAULT 0',
    );
    await queryRunner.query('ALTER TABLE "resource_usage" ADD "energyCreditsPerKwh" integer');
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
    await queryRunner.query('ALTER TABLE "billing_transaction_item" DROP COLUMN "energyCreditsPerKwh"');
    await queryRunner.query('ALTER TABLE "billing_transaction_item" DROP COLUMN "energyMicroWh"');
    await queryRunner.query('ALTER TABLE "resource_usage" DROP COLUMN "energyCreditsPerKwh"');
    await queryRunner.query('ALTER TABLE "resource_billing_configuration" DROP COLUMN "creditsPerKwh"');
  }
}
