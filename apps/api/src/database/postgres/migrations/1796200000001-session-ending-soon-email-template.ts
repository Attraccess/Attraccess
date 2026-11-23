import { MigrationInterface, QueryRunner } from 'typeorm';

const TYPE = 'resource-session-ending-soon';

const SUBJECT = '{{t "subject" "Your session on {resource} ends soon" resource=resource.name}}';

const BODY = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.displayName}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{t 'body' 'Your session on <strong>{resource}</strong> will be stopped automatically in about {minutes} minutes. Open the resource to extend it.' resource=resource.name minutes=session.minutesLeft}}
    </mj-text>
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">{{t 'ends_at' 'Stops automatically at: {time}' time=session.endsAt}}</mj-text>
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'View Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because notifications about the end of resource sessions are enabled in your preferences.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const VARIABLES = [
  'user.username',
  'user.firstName',
  'user.lastName',
  'user.displayName',
  'user.email',
  'user.id',
  'host.frontend',
  'host.backend',
  'resource.id',
  'resource.name',
  'resource.url',
  'session.id',
  'session.endsAt',
  'session.minutesLeft',
].join(',');

const GERMAN: Array<[string, string]> = [
  ['greeting', 'Hallo {name},'],
  [
    'body',
    'Deine Sitzung auf <strong>{resource}</strong> wird in etwa {minutes} Minuten automatisch beendet. Öffne die Ressource, wenn du sie verlängern möchtest.',
  ],
  ['ends_at', 'Automatisches Ende: {time}'],
  ['button', 'Ressource ansehen'],
  ['copy_link', 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>'],
  [
    'footer',
    'Du erhältst diese E-Mail, weil Benachrichtigungen über das bevorstehende Ende von Ressourcensitzungen in deinen Einstellungen aktiviert sind.',
  ],
  ['subject', 'Deine Sitzung auf {resource} endet bald'],
];

/**
 * The "session ends soon" email (ATT-43). A template an administrator already stored keeps its content. The new
 * notification category needs no migration: users without a stored choice get the defaults (everything on).
 */
export class SessionEndingSoonEmailTemplate1796200000001 implements MigrationInterface {
  name = 'SessionEndingSoonEmailTemplate1796200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "email_templates" ("type", "subject", "body", "variables") VALUES ($1, $2, $3, $4) ON CONFLICT ("type") DO NOTHING`,
      [TYPE, SUBJECT, BODY, VARIABLES],
    );
    for (const [key, value] of GERMAN) {
      await queryRunner.query(
        `INSERT INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES ($1, $2, 'de', $3) ON CONFLICT DO NOTHING`,
        [TYPE, key, value],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_template_translations" WHERE "templateType" = $1`, [TYPE]);
    await queryRunner.query(`DELETE FROM "email_templates" WHERE "type" = $1`, [TYPE]);
  }
}
