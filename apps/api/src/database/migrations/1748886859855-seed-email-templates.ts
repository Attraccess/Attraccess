import { MigrationInterface, QueryRunner } from 'typeorm';
import { RESET_PASSWORD_MJML_TEMPLATE } from './seed-password-email-template';
import { VERIFY_EMAIL_MJML_TEMPLATE } from './seed-verification-email-template';

// /workspace/Attraccess/apps/api/src/email/templates/verify-email.template.ts

export class SeedEmailTemplates1748886859854 implements MigrationInterface {
  name = 'SeedEmailTemplates1748886859854';
  public async up(queryRunner: QueryRunner): Promise<void> {
    const defaultTemplates = [
      {
        type: 'verify-email',
        subject: 'Verify your email address',
        body: VERIFY_EMAIL_MJML_TEMPLATE,
      },
      {
        type: 'reset-password',
        subject: 'Reset your password',
        body: RESET_PASSWORD_MJML_TEMPLATE,
      },
    ];

    for (const templateData of defaultTemplates) {
      await queryRunner.query(`INSERT INTO "email_templates" ("type", "subject", "body") VALUES ($1, $2, $3)`, [
        templateData.type,
        templateData.subject,
        templateData.body,
      ]);
    }
  }

  public async down(): Promise<void> {
    // No need to remove essential system templates
  }
}

export { RESET_PASSWORD_MJML_TEMPLATE } from './seed-password-email-template';
export { VERIFY_EMAIL_MJML_TEMPLATE } from './seed-verification-email-template';
