import { MigrationInterface, QueryRunner } from 'typeorm';

const RESOURCE_TAKEOVER_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#D97706" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#FFF7ED" width="600px">
    <mj-section background-color="#D97706" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{resource.name}} was taken over
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          <strong>{{takeover.actorName}}</strong> took over your active session on <strong>{{resource.name}}</strong>.
        </mj-text>
        <mj-text>
          If this was unexpected, please check the resource usage page or contact a maintainer.
        </mj-text>
        <mj-button href="{{resource.url}}" align="left">
          View Resource Usage
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button does not work, paste this into your browser:
          <br />
          <a href="{{resource.url}}">{{resource.url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const RESOURCE_TAKEOVER_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'takeover.actorName',
].join(',');

export class ResourceTakeoverEmailTemplate1781800000000 implements MigrationInterface {
  name = 'ResourceTakeoverEmailTemplate1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      ['resource-takeover', '{{resource.name}} was taken over', RESOURCE_TAKEOVER_MJML, RESOURCE_TAKEOVER_VARIABLES],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'resource-takeover'`);
  }
}
