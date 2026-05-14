import { MigrationInterface, QueryRunner } from 'typeorm';

const RESOURCE_HEALTH_CHANGED_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="{{health.headerColor}}" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          {{health.headline}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          Resource <strong>{{resource.name}}</strong> {{health.bodyAction}}.
        </mj-text>
        {{#if health.identifier}}
        <mj-text>Subsystem: <strong>{{health.identifier}}</strong></mj-text>
        {{/if}}
        <mj-text>
          Previous status: <strong>{{health.previousStatus}}</strong><br/>
          New status: <strong>{{health.status}}</strong>
        </mj-text>
        {{#if health.reason}}
        <mj-text>Reason: {{health.reason}}</mj-text>
        {{/if}}
        <mj-button href="{{resource.url}}" align="left">
          Open Resource
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
          You received this email because you can manage this resource.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const RESOURCE_HEALTH_CHANGED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'health.status',
  'health.previousStatus',
  'health.reason',
  'health.identifier',
  'health.headline',
  'health.headerColor',
  'health.bodyAction',
].join(',');

const PREVIOUS_CHECK_TYPES = [
  'verify-email',
  'user-invitation',
  'reset-password',
  'username-changed',
  'password-changed',
  'resource-usage-billing-transaction-summary',
  'project-invitation',
  'delete-account-confirmation',
];

export class AddResourceHealthChangedEmailTemplate1777400000000 implements MigrationInterface {
  name = 'AddResourceHealthChangedEmailTemplate1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar(255) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);

    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'resource-health-changed',
        '{{health.headline}}: {{resource.name}}',
        RESOURCE_HEALTH_CHANGED_MJML,
        RESOURCE_HEALTH_CHANGED_VARIABLES,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'resource-health-changed'`);
    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN (${PREVIOUS_CHECK_TYPES.map(
        (t) => `'${t}'`,
      ).join(
        ',',
      )}) ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates" WHERE "type" IN (${PREVIOUS_CHECK_TYPES.map(
        (t) => `'${t}'`,
      ).join(',')})`,
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
  }
}
