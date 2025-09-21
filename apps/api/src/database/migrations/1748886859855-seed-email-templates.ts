import { MigrationInterface, QueryRunner } from 'typeorm';

export const RESET_PASSWORD_MJML_TEMPLATE = `
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
          We hope you’re doing well. You’ve requested to reset your password. To proceed, please click the button below:
        </mj-text>

        <!-- Action Button -->
        <mj-button href="{{url}}" align="center">
          Reset Password
        </mj-button>

        <!-- Fallback Link -->
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button above does not work, copy and paste the following link into your browser:
          <br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>

        <!-- Note / Security Advice -->
        <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
          If you did not request this email, you can safely ignore it.
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
          <a href="https://github.com/FabInfra/Attraccess">GitHub</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

// /workspace/Attraccess/apps/api/src/email/templates/verify-email.template.ts
export const VERIFY_EMAIL_MJML_TEMPLATE = `
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
          We hope you’re doing well. You’ve requested to verify your email address. To proceed, please click the button below:
        </mj-text>

        <!-- Action Button -->
        <mj-button href="{{url}}" align="center">
          Verify Email
        </mj-button>

        <!-- Fallback Link -->
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button above does not work, copy and paste the following link into your browser:
          <br />
          <a href="{{url}}">{{url}}</a>
        </mj-text>

        <!-- Note / Security Advice -->
        <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
          If you did not request this email, you can safely ignore it.
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
          <a href="https://github.com/FabInfra/Attraccess">GitHub</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>

`;

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
