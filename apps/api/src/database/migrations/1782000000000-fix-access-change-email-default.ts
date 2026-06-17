import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAccessChangeEmailDefault1782000000000 implements MigrationInterface {
  name = 'FixAccessChangeEmailDefault1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT "id", "categoryChannels" FROM "notification_preference" WHERE "categoryChannels" IS NOT NULL`,
    );

    for (const row of rows as Array<{ id: number; categoryChannels: string }>) {
      try {
        const prefs = JSON.parse(row.categoryChannels) as Record<string, Record<string, boolean>>;
        if (prefs.access_changes && prefs.access_changes.email === false) {
          prefs.access_changes.email = true;
          await queryRunner.query(`UPDATE "notification_preference" SET "categoryChannels" = ? WHERE "id" = ?`, [
            JSON.stringify(prefs),
            row.id,
          ]);
        }
      } catch {
        // skip rows with malformed JSON
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT "id", "categoryChannels" FROM "notification_preference" WHERE "categoryChannels" IS NOT NULL`,
    );

    for (const row of rows as Array<{ id: number; categoryChannels: string }>) {
      try {
        const prefs = JSON.parse(row.categoryChannels) as Record<string, Record<string, boolean>>;
        if (prefs.access_changes && prefs.access_changes.email === true) {
          prefs.access_changes.email = false;
          await queryRunner.query(`UPDATE "notification_preference" SET "categoryChannels" = ? WHERE "id" = ?`, [
            JSON.stringify(prefs),
            row.id,
          ]);
        }
      } catch {
        // skip rows with malformed JSON
      }
    }
  }
}
