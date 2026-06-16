import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_CATEGORY_CHANNELS = JSON.stringify({
  messages: { email: true, push: true, toast: true },
  maintenance_requests: { email: true, push: true, toast: true },
  resource_usage_notes: { email: true, push: true, toast: true },
  resource_health: { email: true, push: true, toast: true },
  resource_takeover: { email: false, push: true, toast: true },
  resource_session_ended: { email: false, push: true, toast: true },
  project_invitations: { email: true, push: true, toast: true },
});

export class SystemNotificationPreferences1781700000000 implements MigrationInterface {
  name = 'SystemNotificationPreferences1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_preference" ADD COLUMN "categoryChannels" text`);

    const rows = await queryRunner.query(
      `SELECT "id", "messagesEmailOnOffline", "messagesPushEnabled" FROM "notification_preference"`,
    );

    for (const row of rows as Array<{ id: number; messagesEmailOnOffline: number; messagesPushEnabled: number }>) {
      const preferences = JSON.parse(DEFAULT_CATEGORY_CHANNELS) as Record<string, Record<string, boolean>>;
      preferences.messages.email = Boolean(row.messagesEmailOnOffline);
      preferences.messages.push = Boolean(row.messagesPushEnabled);
      await queryRunner.query(`UPDATE "notification_preference" SET "categoryChannels" = ? WHERE "id" = ?`, [
        JSON.stringify(preferences),
        row.id,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notification_preference" DROP COLUMN "categoryChannels"`);
  }
}
