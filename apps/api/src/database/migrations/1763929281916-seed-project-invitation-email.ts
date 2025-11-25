import { MigrationInterface, QueryRunner } from 'typeorm';

const PROJECT_INVITATION_MJML = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
      <mj-text font-size="16px" line-height="1.5" />
      <mj-button background-color="#2563EB" color="#FFFFFF" font-size="16px" font-weight="bold" padding="12px 24px" border-radius="4px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" color="#1E40AF" font-weight="bold" padding="0">
          Project Invitation
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="10px 20px">
      <mj-column>
        <mj-text>Hello {{user.username}},</mj-text>
        <mj-text>
          {{inviter.username}} invited you to join <strong>{{project.name}}</strong> as <strong>{{invitation.role}}</strong>.
        </mj-text>
        <mj-button href="{{invitationUrl}}">
          View invitation
        </mj-button>
        <mj-text color="#6B7280" font-size="14px">
          Invitation ID: {{invitation.id}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`;

export class SeedProjectInvitationEmail1763929281916 implements MigrationInterface {
  name = 'SeedProjectInvitationEmail1763929281916';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT OR IGNORE INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4)`,
      [
        'project-invitation',
        'You have been invited to {{project.name}}',
        PROJECT_INVITATION_MJML,
        [
          'user.username',
          'project.name',
          'inviter.username',
          'invitation.id',
          'invitation.role',
          'invitationUrl',
          'host.frontend',
        ].join(','),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = 'project-invitation'`);
  }
}
