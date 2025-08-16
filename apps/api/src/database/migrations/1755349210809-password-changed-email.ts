import { MigrationInterface, QueryRunner } from 'typeorm';

const PASSWORD_CHANGED_MJML_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="20px" color="#1E40AF" font-weight="bold">Your password was changed</mj-text>
        <mj-text color="#1F2937">Hello {{user.username}},</mj-text>
        <mj-text color="#1F2937">This is a confirmation that the password for your account ({{user.email}}) has just been changed.</mj-text>
        <mj-text color="#6B7280">If you did not make this change, please reset your password immediately and contact support.</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export class PasswordChangedEmail1755349210809 implements MigrationInterface {
  name = 'PasswordChangedEmail1755349210809';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed','change-email') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);

    await queryRunner.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ('password-changed', 'Your password has been changed', $1, 'user.username,user.email,user.id,host.frontend,host.backend,url')`,
      [PASSWORD_CHANGED_MJML_TEMPLATE]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'password-changed'`);
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','change-email') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
  }
}
