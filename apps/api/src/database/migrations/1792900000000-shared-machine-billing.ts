import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Billing on shared machines (ATT-1191): a per-meter allocation mode, the shared time segments of a meter, how a
 * metering session accounts its consumption, and the segment breakdown of a charged item.
 */
export class SharedMachineBilling1792900000000 implements MigrationInterface {
  name = 'SharedMachineBilling1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('resource_meter', 'allocation'))) {
      await queryRunner.query(`ALTER TABLE "resource_meter" ADD COLUMN "allocation" varchar NOT NULL DEFAULT 'shared'`);
    }
    // Existing meters keep splitting a shared machine's consumption, which is the default for new ones too.
    await queryRunner.query(`UPDATE "resource_meter" SET "allocation" = 'shared'`);
    if (!(await queryRunner.hasColumn('resource_metering_session', 'accounting'))) {
      await queryRunner.query(
        `ALTER TABLE "resource_metering_session" ADD COLUMN "accounting" varchar NOT NULL DEFAULT 'own'`,
      );
    }
    if (!(await queryRunner.hasColumn('billing_transaction_item', 'allocation'))) {
      await queryRunner.query(`ALTER TABLE "billing_transaction_item" ADD COLUMN "allocation" text`);
    }
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "resource_metering_segment" (
      "id" varchar PRIMARY KEY NOT NULL,
      "resourceId" integer NOT NULL,
      "meterId" integer NOT NULL,
      "status" varchar NOT NULL,
      "startedAt" datetime NOT NULL,
      "endedAt" datetime,
      "startValue" varchar NOT NULL,
      "endValue" varchar,
      "participants" text NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT "FK_resource_metering_segment_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE,
      CONSTRAINT "FK_resource_metering_segment_meter" FOREIGN KEY ("meterId") REFERENCES "resource_meter" ("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_metering_segment_meter" ON "resource_metering_segment" ("meterId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_metering_segment_meter"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resource_metering_segment"`);
    if (await queryRunner.hasColumn('billing_transaction_item', 'allocation')) {
      await queryRunner.query(`ALTER TABLE "billing_transaction_item" DROP COLUMN "allocation"`);
    }
    if (await queryRunner.hasColumn('resource_metering_session', 'accounting')) {
      await queryRunner.query(`ALTER TABLE "resource_metering_session" DROP COLUMN "accounting"`);
    }
    if (await queryRunner.hasColumn('resource_meter', 'allocation')) {
      await queryRunner.query(`ALTER TABLE "resource_meter" DROP COLUMN "allocation"`);
    }
  }
}
