import { MigrationInterface, QueryRunner } from 'typeorm';

export class PushNotifications1781600000000 implements MigrationInterface {
  name = 'PushNotifications1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "push_subscription" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "userId" integer NOT NULL,
        "endpoint" text NOT NULL,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "userAgent" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "lastSeenAt" datetime,
        CONSTRAINT "UQ_push_subscription_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscription_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_push_subscription_user" ON "push_subscription" ("userId")`);

    await queryRunner.query(
      `ALTER TABLE "notification_preference" ADD COLUMN "messagesPushEnabled" boolean NOT NULL DEFAULT (1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_preference" DROP COLUMN "messagesPushEnabled"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_push_subscription_user"`);
    await queryRunner.query(`DROP TABLE "push_subscription"`);
  }
}
