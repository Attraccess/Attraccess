import { MigrationInterface, QueryRunner } from 'typeorm';

export const USER_INVITATION_MJML_TEMPLATE = `
<mjml>
  <mj-head>
    <mj-attributes>
      <!-- Global styles -->
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button
        background-color="#2563EB"
        color="#FFFFFF"
        font-size="16px"
        font-weight="bold"
        padding="15px 30px"
        border-radius="4px"
        text-decoration="none"
      />
    </mj-attributes>
    <mj-style>
      /* Ensure links inherit color and no underline */
      a {
        color: inherit !important;
        text-decoration: none !important;
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <!-- Header Section -->
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="24px" color="#1E40AF" font-weight="bold" padding="0">
          Attraccess
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Divider -->
    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" />
      </mj-column>
    </mj-section>

    <!-- Body Section -->
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <!-- Greeting -->
        <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
          Hello {{user.username}},
        </mj-text>

        <!-- Intro Text -->
        <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
          We hope you’re doing well. You’ve been invited to join Attraccess. To proceed, please click the button below:
        </mj-text>

        <!-- Action Button -->
        <mj-button href="{{url}}" align="center">
          Accept Invitation
        </mj-button>

        <!-- Fallback Link -->
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button above does not work, copy and paste the following link into your browser:
          <br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Divider -->
    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" />
      </mj-column>
    </mj-section>

    <!-- Footer Section -->
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center" padding="5px 0 0 0">
          Visit us:
          <a href="{{host.frontend}}">{{host.frontend}}</a> |
          <a href="https://github.com/Attraccess/Attraccess">GitHub</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

export class UserInvitationEmail1763122777587 implements MigrationInterface {
  name = 'UserInvitationEmail1763122777587';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_email_templates" ("type" varchar CHECK( "type" IN ('verify-email','user-invitation','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "email_templates"`);
    await queryRunner.query(`ALTER TABLE "temporary_email_templates" RENAME TO "email_templates"`);

    await queryRunner.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'user-invitation',
        'You have been invited to join Attraccess!',
        USER_INVITATION_MJML_TEMPLATE,
        'user.username,user.email,user.id,host.frontend,host.backend,url',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'user-invitation'`);

    await queryRunner.query(`ALTER TABLE "email_templates" RENAME TO "temporary_email_templates"`);
    await queryRunner.query(
      `CREATE TABLE "email_templates" ("type" varchar CHECK( "type" IN ('verify-email','reset-password','username-changed','password-changed','resource-usage-billing-transaction-summary') ) PRIMARY KEY NOT NULL, "subject" varchar(255) NOT NULL, "body" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "variables" text NOT NULL)`,
    );
    await queryRunner.query(
      `INSERT INTO "email_templates"("type", "subject", "body", "createdAt", "updatedAt", "variables") SELECT "type", "subject", "body", "createdAt", "updatedAt", "variables" FROM "temporary_email_templates"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_email_templates"`);
  }
}
