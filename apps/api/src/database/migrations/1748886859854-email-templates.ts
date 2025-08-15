import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailTemplates1748886859854 implements MigrationInterface {
  name = 'EmailTemplates1748886859854';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_templates"`);
  }
}
