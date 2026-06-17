import { MigrationInterface, QueryRunner } from 'typeorm';

const RESOURCE_SESSION_ENDED_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#B45309" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{resource.name}} session ended
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          <strong>{{session.endedBy}}</strong> ended your active session on <strong>{{resource.name}}</strong>.
        </mj-text>
        {{#if session.endedAt}}
        <mj-text>Ended at: {{session.endedAt}}</mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="left">
          Open Resource Usage
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button does not work, paste this into your browser:
          <br />
          <a href="{{resource.url}}">{{resource.url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">
          You received this email because resource session ended notifications are enabled in your preferences.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const RESOURCE_SESSION_ENDED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'session.id',
  'session.endedAt',
  'session.endedBy',
].join(',');

export class ResourceSessionEndedEmailTemplate1781850000000 implements MigrationInterface {
  name = 'ResourceSessionEndedEmailTemplate1781850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'resource-session-ended',
        '{{resource.name}} session ended',
        RESOURCE_SESSION_ENDED_MJML,
        RESOURCE_SESSION_ENDED_VARIABLES,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'resource-session-ended'`);
  }
}
