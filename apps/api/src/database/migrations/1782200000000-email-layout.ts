import { MigrationInterface, QueryRunner } from 'typeorm';
import { emailLayoutAccessChange } from './email-layout-access-change';
import { emailLayoutDeleteAccountConfirmation } from './email-layout-delete-account-confirmation';
import { emailLayoutMaintenanceRequestCreated } from './email-layout-maintenance-request-created';
import { emailLayoutMessageReceived } from './email-layout-message-received';
import { emailLayoutPasswordChanged } from './email-layout-password-changed';
import { emailLayoutProjectInvitation } from './email-layout-project-invitation';
import { emailLayoutResetPassword } from './email-layout-reset-password';
import { emailLayoutResourceHealthChanged } from './email-layout-resource-health-changed';
import { emailLayoutResourceSessionEnded } from './email-layout-resource-session-ended';
import { emailLayoutResourceTakeover } from './email-layout-resource-takeover';
import { emailLayoutResourceUsageBillingTransactionSummary } from './email-layout-resource-usage-billing-transaction-summary';
import { emailLayoutResourceUsageNoteAdded } from './email-layout-resource-usage-note-added';
import { emailLayoutUserInvitation } from './email-layout-user-invitation';
import { emailLayoutUserRetrainingRequired } from './email-layout-user-retraining-required';
import { emailLayoutUsernameChanged } from './email-layout-username-changed';
import { emailLayoutVerifyEmail } from './email-layout-verify-email';

const EMAIL_LAYOUT_SETTINGS_PARENT = 'email_layout';
const EMAIL_LAYOUT_SETTINGS_KEY = 'body';

const DEFAULT_GLOBAL_LAYOUT = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" color="#1F2937" />
      <mj-button
        background-color="#2563EB"
        color="#FFFFFF"
        font-size="16px"
        font-weight="bold"
        padding="12px 30px"
        border-radius="6px"
        text-decoration="none"
      />
    </mj-attributes>
    <mj-style>
      a { color: #2563EB; text-decoration: none; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F8FAFC" width="600px">
    <mj-section background-color="#FFFFFF" padding="24px 0 16px 0">
      <mj-column>
        <mj-image
          src="{{host.logoUrl}}"
          width="200px"
          href="https://attraccess.org"
          alt="Attraccess"
          padding="0"
        />
      </mj-column>
    </mj-section>

    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" border-width="1px" />
      </mj-column>
    </mj-section>

    {{content}}

    <mj-section padding="0">
      <mj-column>
        <mj-divider border-color="#E2E8F0" border-width="1px" />
      </mj-column>
    </mj-section>
    <mj-section background-color="#FFFFFF" padding="16px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#9CA3AF" align="center" padding="0">
          <a href="https://attraccess.org" style="color:#9CA3AF;">attraccess.org</a>
          &nbsp;·&nbsp;
          <a href="{{host.frontend}}" style="color:#9CA3AF;">{{host.frontend}}</a>
          &nbsp;·&nbsp;
          <a href="{{host.notificationPreferencesUrl}}" style="color:#9CA3AF;">Notification preferences</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// Content-only sections (injected into {{content}}) for each default template type.
// These replace the old full-MJML bodies for templates that were never edited.
const DEFAULT_TEMPLATE_CONTENT: Record<string, string> = {
  ...emailLayoutVerifyEmail,
  ...emailLayoutResetPassword,
  ...emailLayoutUserInvitation,
  ...emailLayoutUsernameChanged,
  ...emailLayoutPasswordChanged,
  ...emailLayoutDeleteAccountConfirmation,
  ...emailLayoutProjectInvitation,
  ...emailLayoutResourceUsageBillingTransactionSummary,
  ...emailLayoutResourceHealthChanged,
  ...emailLayoutUserRetrainingRequired,
  ...emailLayoutMessageReceived,
  ...emailLayoutResourceUsageNoteAdded,
  ...emailLayoutResourceTakeover,
  ...emailLayoutResourceSessionEnded,
  ...emailLayoutAccessChange,
  ...emailLayoutMaintenanceRequestCreated,
};

function extractMjmlBodyContent(mjml: string): string | null {
  const match = mjml.match(/<mj-body[^>]*>([\s\S]*?)<\/mj-body>/i);
  return match ? match[1].trim() : null;
}

export class EmailLayout1782200000000 implements MigrationInterface {
  name = 'EmailLayout1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES ($1, $2, $3)`, [
      EMAIL_LAYOUT_SETTINGS_PARENT,
      EMAIL_LAYOUT_SETTINGS_KEY,
      DEFAULT_GLOBAL_LAYOUT,
    ]);

    const templates: Array<{ type: string; body: string; createdAt: string; updatedAt: string }> =
      await queryRunner.query(`SELECT "type", "body", "createdAt", "updatedAt" FROM "email_templates"`);

    for (const template of templates) {
      const neverEdited = template.createdAt === template.updatedAt;
      const newContent = neverEdited ? DEFAULT_TEMPLATE_CONTENT[template.type] : undefined;

      const bodyContent = newContent ?? extractMjmlBodyContent(template.body);
      if (bodyContent !== null) {
        await queryRunner.query(`UPDATE "email_templates" SET "body" = $1 WHERE "type" = $2`, [
          bodyContent,
          template.type,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "setting" WHERE "parent" = $1 AND "key" = $2`, [
      EMAIL_LAYOUT_SETTINGS_PARENT,
      EMAIL_LAYOUT_SETTINGS_KEY,
    ]);
  }
}
