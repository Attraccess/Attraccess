import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationPreferences1780100000000 implements MigrationInterface {
  name = 'NotificationPreferences1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_preference" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "messagesEmailOnOffline" boolean NOT NULL DEFAULT (1),
        CONSTRAINT "FK_notification_preference_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notification_preference_user" ON "notification_preference" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notification_preference_user"`);
    await queryRunner.query(`DROP TABLE "notification_preference"`);
  }
}
