import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Meters can be archived. Every existing meter stays active. A meter name is unique among the active meters of a
 * resource only, so a new meter can reuse the name of an archived one. The two indexes on `meterId` serve the check
 * for a meter's history, which decides whether it may be deleted.
 */
export class ResourceMeterArchive1796400000000 implements MigrationInterface {
  name = 'ResourceMeterArchive1796400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource_meter" ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_meter_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_resource_meter_name" ON "resource_meter" ("resourceId", "name") WHERE "archivedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_metering_session_meter" ON "resource_metering_session" ("meterId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resource_metering_operation_meter" ON "resource_metering_operation" ("meterId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_metering_operation_meter"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_metering_session_meter"`);
    // Without the archive every meter is active again, so names must be unique across all of them. The history of
    // an archived meter must survive: one that shares its name is renamed rather than removed.
    await queryRunner.query(
      `UPDATE "resource_meter" AS archived SET "name" = archived."name" || ' (archived ' || archived."id" || ')'
       WHERE archived."archivedAt" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "resource_meter" AS other
         WHERE other."resourceId" = archived."resourceId" AND other."name" = archived."name" AND other."id" <> archived."id"
       )`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_resource_meter_name"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_resource_meter_name" ON "resource_meter" ("resourceId", "name")`);
    await queryRunner.query(`ALTER TABLE "resource_meter" DROP COLUMN IF EXISTS "archivedAt"`);
  }
}
