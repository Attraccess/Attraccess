import { MigrationInterface, QueryRunner } from 'typeorm';

const USER_RETRAINING_REQUIRED_MJML = `
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
          Retraining required: {{resource.name}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          Your training for <strong>{{resource.name}}</strong> is due for renewal.
        </mj-text>
        <mj-text>Reason: {{retraining.reason}}</mj-text>
        {{#if retraining.blocksAccess}}
        <mj-text>
          Access to this resource is blocked until you have been retrained by an introducer.
        </mj-text>
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
          You received this email because your training for this resource requires renewal.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const USER_RETRAINING_REQUIRED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'retraining.reason',
  'retraining.blocksAccess',
].join(',');

export class UserRetrainingRequirement1780000000000 implements MigrationInterface {
  name = 'UserRetrainingRequirement1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "retrainingMaxAgeDays" integer`);
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "retrainingMaxInactivityDays" integer`);
    await queryRunner.query(`ALTER TABLE "resource" ADD COLUMN "retrainingBlocksAccess" boolean NOT NULL DEFAULT (0)`);

    await queryRunner.query(`ALTER TABLE "resource_group" ADD COLUMN "retrainingMaxAgeDays" integer`);
    await queryRunner.query(`ALTER TABLE "resource_group" ADD COLUMN "retrainingMaxInactivityDays" integer`);
    await queryRunner.query(
      `ALTER TABLE "resource_group" ADD COLUMN "retrainingBlocksAccess" boolean NOT NULL DEFAULT (0)`,
    );

    await queryRunner.query(`ALTER TABLE "resource_introduction" ADD COLUMN "retrainingNotifiedAt" datetime`);

    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'user-retraining-required',
        'Retraining required: {{resource.name}}',
        USER_RETRAINING_REQUIRED_MJML,
        USER_RETRAINING_REQUIRED_VARIABLES,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'user-retraining-required'`);

    await queryRunner.query(`ALTER TABLE "resource_introduction" DROP COLUMN "retrainingNotifiedAt"`);

    await queryRunner.query(`ALTER TABLE "resource_group" DROP COLUMN "retrainingBlocksAccess"`);
    await queryRunner.query(`ALTER TABLE "resource_group" DROP COLUMN "retrainingMaxInactivityDays"`);
    await queryRunner.query(`ALTER TABLE "resource_group" DROP COLUMN "retrainingMaxAgeDays"`);

    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "retrainingBlocksAccess"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "retrainingMaxInactivityDays"`);
    await queryRunner.query(`ALTER TABLE "resource" DROP COLUMN "retrainingMaxAgeDays"`);
  }
}
