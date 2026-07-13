import { MigrationInterface, QueryRunner } from 'typeorm';

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
export const DEFAULT_TEMPLATE_CONTENT: Record<string, string> = {
  'verify-email': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 24px 0">
      Please verify your email address to activate your Attraccess account.
    </mj-text>
    <mj-button href="{{url}}" align="center">Verify Email</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{url}}">{{url}}</a>
    </mj-text>
    <mj-text font-size="13px" color="#9CA3AF" padding="16px 0 0 0">
      If you did not create an account, you can safely ignore this email.
    </mj-text>
  </mj-column>
</mj-section>`,

  'reset-password': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 24px 0">
      We received a request to reset your password. Click the button below to proceed.
    </mj-text>
    <mj-button href="{{url}}" align="center">Reset Password</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{url}}">{{url}}</a>
    </mj-text>
    <mj-text font-size="13px" color="#9CA3AF" padding="16px 0 0 0">
      If you did not request a password reset, you can safely ignore this email.
    </mj-text>
  </mj-column>
</mj-section>`,

  'user-invitation': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 24px 0">
      You have been invited to join Attraccess. Accept your invitation to get started.
    </mj-text>
    <mj-button href="{{url}}" align="center">Accept Invitation</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{url}}">{{url}}</a>
    </mj-text>
  </mj-column>
</mj-section>`,

  'username-changed': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      Your username was changed from <strong>{{user.previousUsername}}</strong> to <strong>{{user.newUsername}}</strong>.
    </mj-text>
    <mj-text font-size="13px" color="#9CA3AF" padding="0">
      If you did not make this change, please contact support immediately.
    </mj-text>
  </mj-column>
</mj-section>`,

  'password-changed': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      This is a confirmation that the password for your account ({{user.email}}) has been changed.
    </mj-text>
    <mj-text font-size="13px" color="#9CA3AF" padding="0">
      If you did not make this change, please reset your password immediately and contact support.
    </mj-text>
  </mj-column>
</mj-section>`,

  'delete-account-confirmation': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 24px 0">
      We received a request to delete your account. Click the button below to confirm. This action cannot be undone.
    </mj-text>
    <mj-button href="{{url}}" align="center" background-color="#DC2626">Confirm Deletion</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{url}}">{{url}}</a>
    </mj-text>
    <mj-text font-size="13px" color="#9CA3AF" padding="16px 0 0 0">
      If you did not request account deletion, you can safely ignore this email.
    </mj-text>
  </mj-column>
</mj-section>`,

  'project-invitation': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 24px 0">
      {{inviter.username}} has invited you to join the project <strong>{{project.name}}</strong> as <strong>{{invitation.role}}</strong>.
    </mj-text>
    <mj-button href="{{invitationUrl}}" align="center">View Invitation</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Invitation ID: {{invitation.id}}
    </mj-text>
  </mj-column>
</mj-section>`,

  'resource-usage-billing-transaction-summary': `<mj-section background-color="#FFFFFF" padding="32px 20px 8px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 8px 0">
      Your session on <strong>{{resource.name}}</strong> has ended. Here is your receipt:
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 4px 0">
      Start: {{usage.startTime}}<br/>
      End: {{usage.endTime}}<br/>
      Duration: {{usage.roundedMinutes}} min
    </mj-text>
  </mj-column>
</mj-section>
<mj-section background-color="#FFFFFF" padding="0 20px 24px 20px">
  <mj-column>
    <mj-table>
      <tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Total</th></tr>
      {{#each items}}
      <tr>
        <td>{{this.name}}</td>
        <td align="right">{{this.quantity}}</td>
        <td align="right">{{this.unitPrice}}</td>
        <td align="right">{{this.total}}</td>
      </tr>
      {{/each}}
      <tr>
        <td colspan="3" align="right"><strong>Total Credits</strong></td>
        <td align="right"><strong>{{totalCredits}}</strong></td>
      </tr>
      <tr>
        <td colspan="3" align="right">New Balance</td>
        <td align="right">{{newBalance}}</td>
      </tr>
    </mj-table>
  </mj-column>
</mj-section>`,

  'resource-health-changed': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      Resource <strong>{{resource.name}}</strong> {{health.bodyAction}}.
    </mj-text>
    {{#if health.identifier}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 4px 0">Subsystem: <strong>{{health.identifier}}</strong></mj-text>
    {{/if}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      Previous status: <strong>{{health.previousStatus}}</strong><br/>
      New status: <strong>{{health.status}}</strong>
    </mj-text>
    {{#if health.reason}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">Reason: {{health.reason}}</mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">Open Resource</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because you can manage this resource.
    </mj-text>
  </mj-column>
</mj-section>`,

  'user-retraining-required': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      Your training for <strong>{{resource.name}}</strong> is due for renewal.
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">Reason: {{retraining.reason}}</mj-text>
    {{#if retraining.blocksAccess}}
    <mj-text font-size="14px" color="#DC2626" padding="0 0 12px 0">
      Access to this resource is blocked until you have been retrained by an introducer.
    </mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">Open Resource</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because your training for this resource requires renewal.
    </mj-text>
  </mj-column>
</mj-section>`,

  'message-received': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      <strong>{{message.senderName}}</strong> sent you a message while you were offline:
    </mj-text>
    <mj-text font-size="14px" color="#374151" padding="12px" container-background-color="#F8FAFC">
      {{message.preview}}
    </mj-text>
    <mj-button href="{{message.conversationUrl}}" align="center">Open Conversation</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{message.conversationUrl}}">{{message.conversationUrl}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because you were offline when this message arrived.
    </mj-text>
  </mj-column>
</mj-section>`,

  'resource-usage-note-added': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      <strong>{{note.authorName}}</strong> left a note when {{note.phaseAction}} <strong>{{resource.name}}</strong>.
    </mj-text>
    <mj-text font-size="14px" color="#111827" padding="12px" container-background-color="#F8FAFC">
      {{note.content}}
    </mj-text>
    <mj-button href="{{resource.url}}" align="center">View Resource</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because you are an introducer, maintainer or administrator for this resource.
    </mj-text>
  </mj-column>
</mj-section>`,

  'resource-takeover': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      <strong>{{takeover.actorName}}</strong> took over your active session on <strong>{{resource.name}}</strong>.
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      If this was unexpected, please check the resource usage page or contact a maintainer.
    </mj-text>
    <mj-button href="{{resource.url}}" align="center">View Resource</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
  </mj-column>
</mj-section>`,

  'resource-session-ended': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      <strong>{{session.endedBy}}</strong> ended your active session on <strong>{{resource.name}}</strong>.
    </mj-text>
    {{#if session.endedAt}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">Ended at: {{session.endedAt}}</mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">View Resource</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because resource session ended notifications are enabled in your preferences.
    </mj-text>
  </mj-column>
</mj-section>`,

  'access-change': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">{{accessChange.body}}</mj-text>
    {{#if accessChange.url}}
    <mj-button href="{{accessChange.url}}" align="center">View Details</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{accessChange.url}}">{{accessChange.url}}</a>
    </mj-text>
    {{/if}}
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because access-change notifications are enabled for your account.
    </mj-text>
  </mj-column>
</mj-section>`,

  'maintenance-request-created': `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">Hello {{user.username}},</mj-text>
    <mj-text padding="0 0 12px 0">
      <strong>{{request.requestedBy}}</strong> reported that <strong>{{resource.name}}</strong> may need maintenance.
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">Reason: {{request.reason}}</mj-text>
    <mj-button href="{{resource.url}}" align="center">Review Request</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      Or copy this link into your browser:<br /><a href="{{resource.url}}">{{resource.url}}</a>
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      You received this email because you can manage maintenance for this resource.
    </mj-text>
  </mj-column>
</mj-section>`,
};

function extractMjmlBodyContent(mjml: string): string | null {
  const match = mjml.match(/<mj-body[^>]*>([\s\S]*?)<\/mj-body>/i);
  return match ? match[1].trim() : null;
}

export class EmailLayout1782200000000 implements MigrationInterface {
  name = 'EmailLayout1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ($1, $2, $3)`,
      [EMAIL_LAYOUT_SETTINGS_PARENT, EMAIL_LAYOUT_SETTINGS_KEY, DEFAULT_GLOBAL_LAYOUT],
    );

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
    await queryRunner.query(
      `DELETE FROM "setting" WHERE "parent" = $1 AND "key" = $2`,
      [EMAIL_LAYOUT_SETTINGS_PARENT, EMAIL_LAYOUT_SETTINGS_KEY],
    );
  }
}
