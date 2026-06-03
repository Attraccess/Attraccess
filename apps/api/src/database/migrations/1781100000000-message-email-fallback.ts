import { MigrationInterface, QueryRunner } from 'typeorm';

const MESSAGE_RECEIVED_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
    <mj-style>
      a { color: inherit !important; text-decoration: none !important; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#1E40AF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#FFFFFF" font-weight="bold" padding="0">
          New message from {{message.senderName}}
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          <strong>{{message.senderName}}</strong> sent you a message on Attraccess while you were offline:
        </mj-text>
        <mj-text font-size="15px" color="#374151" padding="10px 20px" background-color="#F3F7FB">
          {{message.preview}}
        </mj-text>
        <mj-button href="{{message.conversationUrl}}" align="left">
          Open Conversation
        </mj-button>
        <mj-text font-size="14px" color="#4B5563" padding="20px 0 0 0">
          If the button does not work, paste this into your browser:
          <br />
          <a href="{{message.conversationUrl}}">{{message.conversationUrl}}</a>
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="0 20px 20px 20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">
          You received this email because you were offline when this message arrived. You can disable
          these notifications in your messaging preferences.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

const MESSAGE_RECEIVED_VARIABLES = [
  'user.username',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'message.senderName',
  'message.preview',
  'message.conversationUrl',
].join(',');

export class MessageEmailFallback1781100000000 implements MigrationInterface {
  name = 'MessageEmailFallback1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversation_participant" ADD COLUMN "lastNotifiedAt" datetime`);

    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'message-received',
        'New message from {{message.senderName}}',
        MESSAGE_RECEIVED_MJML,
        MESSAGE_RECEIVED_VARIABLES,
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'message-received'`);
    await queryRunner.query(`ALTER TABLE "conversation_participant" DROP COLUMN "lastNotifiedAt"`);
  }
}
