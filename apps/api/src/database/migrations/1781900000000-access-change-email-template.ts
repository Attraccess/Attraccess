import { MigrationInterface, QueryRunner } from 'typeorm';

const ACCESS_CHANGE_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#2563EB" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{accessChange.title}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>{{accessChange.body}}</mj-text>
        {{#if accessChange.url}}
        <mj-button href="{{accessChange.url}}" align="left">
          View Details
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button does not work, paste this into your browser:
          <br />
          <a href="{{accessChange.url}}">{{accessChange.url}}</a>
        </mj-text>
        {{/if}}
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">
          You received this email because access-change email notifications are enabled for your account.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const ACCESS_CHANGE_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'accessChange.title',
  'accessChange.body',
  'accessChange.url',
].join(',');

export class AccessChangeEmailTemplate1781900000000 implements MigrationInterface {
  name = 'AccessChangeEmailTemplate1781900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      ['access-change', '{{accessChange.title}}', ACCESS_CHANGE_MJML, ACCESS_CHANGE_VARIABLES],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'access-change'`);
  }
}
