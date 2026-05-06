import { MigrationInterface, QueryRunner } from 'typeorm';

const WARNING_BODY = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#1E40AF" font-weight="bold" padding="0">
          Retraining required
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="10px 20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          Your training for <strong>{{resource.name}}</strong> expires on {{dueAt}}. Please contact a tutor to schedule a retraining session.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`.trim();

const EXPIRED_BODY = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#1E40AF" font-weight="bold" padding="0">
          Access paused
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="10px 20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          Your training for <strong>{{resource.name}}</strong> has expired. Access is paused until you complete a retraining session.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`.trim();

export class SeedIntroductionEmailTemplates1778016390001 implements MigrationInterface {
  name = 'SeedIntroductionEmailTemplates1778016390001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'introduction-expiry-warning',
        'Retraining required: {{resource.name}}',
        WARNING_BODY,
        ['user.username', 'resource.name', 'dueAt', 'host.frontend', 'host.backend'].join(','),
      ],
    );
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'introduction-expired',
        'Access paused: {{resource.name}}',
        EXPIRED_BODY,
        ['user.username', 'resource.name', 'host.frontend', 'host.backend'].join(','),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "email_templates" WHERE "type" IN ('introduction-expiry-warning','introduction-expired')`,
    );
  }
}
