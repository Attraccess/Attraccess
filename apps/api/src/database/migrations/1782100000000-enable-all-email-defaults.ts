import { MigrationInterface, QueryRunner } from 'typeorm';

const ALL_EMAIL_ON = ['resource_takeover', 'resource_session_ended', 'nfc_cards'];

export class EnableAllEmailDefaults1782100000000 implements MigrationInterface {
  name = 'EnableAllEmailDefaults1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT "id", "categoryChannels" FROM "notification_preference" WHERE "categoryChannels" IS NOT NULL`,
    );

    for (const row of rows as Array<{ id: number; categoryChannels: string }>) {
      try {
        const prefs = JSON.parse(row.categoryChannels) as Record<string, Record<string, boolean>>;
        let changed = false;
        for (const category of ALL_EMAIL_ON) {
          if (prefs[category] && prefs[category].email === false) {
            prefs[category].email = true;
            changed = true;
          }
        }
        if (changed) {
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
        let changed = false;
        for (const category of ALL_EMAIL_ON) {
          if (prefs[category] && prefs[category].email === true) {
            prefs[category].email = false;
            changed = true;
          }
        }
        if (changed) {
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
