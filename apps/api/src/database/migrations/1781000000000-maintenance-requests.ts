import { MigrationInterface, QueryRunner } from 'typeorm';

const MAINTENANCE_REQUEST_CREATED_MJML = `
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
          Maintenance requested: {{resource.name}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          <strong>{{request.requestedBy}}</strong> reported that <strong>{{resource.name}}</strong> may need maintenance.
        </mj-text>
        <mj-text>Reason: {{request.reason}}</mj-text>
        <mj-button href="{{resource.url}}" align="left">
          Review Request
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
          You received this email because you can manage maintenance for this resource.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const MAINTENANCE_REQUEST_CREATED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'request.id',
  'request.reason',
  'request.requestedBy',
].join(',');

export class MaintenanceRequests1781000000000 implements MigrationInterface {
  name = 'MaintenanceRequests1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "resource_maintenance_request" (` +
        `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, ` +
        `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
        `"reason" text NOT NULL, ` +
        `"status" varchar NOT NULL DEFAULT ('open'), ` +
        `"resolvedAt" datetime, ` +
        `"resourceId" integer NOT NULL, ` +
        `"createdByUserId" integer, ` +
        `"resolvedByUserId" integer, ` +
        `"resultingMaintenanceId" integer, ` +
        `CONSTRAINT "FK_mreq_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, ` +
        `CONSTRAINT "FK_mreq_created_by" FOREIGN KEY ("createdByUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, ` +
        `CONSTRAINT "FK_mreq_resolved_by" FOREIGN KEY ("resolvedByUserId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, ` +
        `CONSTRAINT "FK_mreq_maintenance" FOREIGN KEY ("resultingMaintenanceId") REFERENCES "resource_maintenance" ("id") ON DELETE SET NULL ON UPDATE NO ACTION` +
        `)`,
    );

    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'maintenance-request-created',
        'Maintenance requested: {{resource.name}}',
        MAINTENANCE_REQUEST_CREATED_MJML,
        MAINTENANCE_REQUEST_CREATED_VARIABLES,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'maintenance-request-created'`);
    await queryRunner.query(`DROP TABLE "resource_maintenance_request"`);
  }
}
