import { MigrationInterface, QueryRunner } from 'typeorm';

export class DashboardPins1793300000000 implements MigrationInterface {
  name = 'DashboardPins1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "dashboard_pin" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "itemType" text NOT NULL,
        "itemId" text NOT NULL,
        "position" integer NOT NULL,
        CONSTRAINT "FK_dashboard_pin_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dashboard_pin_user_position" ON "dashboard_pin" ("userId", "position")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dashboard_pin_user_item" ON "dashboard_pin" ("userId", "itemType", "itemId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dashboard_pin_user_item"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dashboard_pin_user_position"`);
    await queryRunner.query(`DROP TABLE "dashboard_pin"`);
  }
}
