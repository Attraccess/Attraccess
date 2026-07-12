import { MigrationInterface, QueryRunner } from 'typeorm';

type Translation = { templateType: string; key: string; value: string };

const RESOURCE_HEALTH_CHANGED_MJML = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{#if health.isDegraded}}
        {{t 'body_degraded' 'Resource <strong>{resource}</strong> has become degraded.' resource=resource.name}}
      {{else}}
        {{t 'body_recovered' 'Resource <strong>{resource}</strong> is healthy again.' resource=resource.name}}
      {{/if}}
    </mj-text>
    {{#if health.identifier}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 4px 0">{{t 'subsystem_label' 'Subsystem: <strong>{subsystem}</strong>' subsystem=health.identifier}}</mj-text>
    {{/if}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'previous_status' 'Previous status: <strong>{status}</strong>' status=health.previousStatus}}<br/>
      {{t 'new_status' 'New status: <strong>{status}</strong>' status=health.status}}
    </mj-text>
    {{#if health.reason}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">{{t 'reason_label' 'Reason: {reason}' reason=health.reason}}</mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'Open Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because you can manage this resource.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const USER_RETRAINING_REQUIRED_MJML = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{t 'body' 'Your training for <strong>{resource}</strong> is due for renewal.' resource=resource.name}}
    </mj-text>
    {{#if retraining.isAge}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_age' 'Your training has reached its maximum age and must be renewed.'}}
    </mj-text>
    {{else if retraining.isInactivity}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_inactivity' 'You have not used this resource for the configured period and must be retrained.'}}
    </mj-text>
    {{else}}
    <mj-text font-size="14px" color="#4B5563" padding="0 0 12px 0">
      {{t 'reason_default' 'Your training must be renewed.'}}
    </mj-text>
    {{/if}}
    {{#if retraining.blocksAccess}}
    <mj-text font-size="14px" color="#DC2626" padding="0 0 12px 0">
      {{t 'blocks_access' 'Access to this resource is blocked until you have been retrained by an introducer.'}}
    </mj-text>
    {{/if}}
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'Open Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because your training for this resource requires renewal.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const RESOURCE_USAGE_NOTE_ADDED_MJML = `<mj-section background-color="#FFFFFF" padding="32px 20px 24px 20px">
  <mj-column>
    <mj-text padding="0 0 12px 0">{{t 'greeting' 'Hello {name},' name=user.username}}</mj-text>
    <mj-text padding="0 0 12px 0">
      {{#if note.isStart}}
        {{t 'body_start' '<strong>{author}</strong> left a note when starting <strong>{resource}</strong>.' author=note.authorName resource=resource.name}}
      {{else}}
        {{t 'body_end' '<strong>{author}</strong> left a note when finishing <strong>{resource}</strong>.' author=note.authorName resource=resource.name}}
      {{/if}}
    </mj-text>
    <mj-text font-size="14px" color="#111827" padding="12px" container-background-color="#F8FAFC">
      {{note.content}}
    </mj-text>
    <mj-button href="{{resource.url}}" align="center">{{t 'button' 'View Resource'}}</mj-button>
    <mj-text font-size="13px" color="#6B7280" padding="20px 0 0 0">
      {{t 'copy_link' 'Or copy this link into your browser:<br /><a href="{url}">{url}</a>' url=resource.url}}
    </mj-text>
    <mj-text font-size="12px" color="#9CA3AF" padding="16px 0 0 0">
      {{t 'footer' 'You received this email because you are an introducer, maintainer or administrator for this resource.'}}
    </mj-text>
  </mj-column>
</mj-section>`;

const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';

const DE: Translation[] = [
  // verify-email
  { templateType: 'verify-email', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'verify-email', key: 'body', value: 'Bitte bestätige deine E-Mail-Adresse, um dein Attraccess-Konto zu aktivieren.' },
  { templateType: 'verify-email', key: 'button', value: 'E-Mail bestätigen' },
  { templateType: 'verify-email', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'verify-email', key: 'footer', value: 'Wenn du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.' },
  // reset-password
  { templateType: 'reset-password', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'reset-password', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um fortzufahren.' },
  { templateType: 'reset-password', key: 'button', value: 'Passwort zurücksetzen' },
  { templateType: 'reset-password', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'reset-password', key: 'footer', value: 'Wenn du kein Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren.' },
  // user-invitation
  { templateType: 'user-invitation', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'user-invitation', key: 'body', value: 'Du wurdest eingeladen, Attraccess beizutreten. Nimm deine Einladung an, um loszulegen.' },
  { templateType: 'user-invitation', key: 'button', value: 'Einladung annehmen' },
  { templateType: 'user-invitation', key: 'copy_link', value: COPY_LINK_DE },
  // password-changed
  { templateType: 'password-changed', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'password-changed', key: 'body', value: 'Dies ist eine Bestätigung, dass das Passwort für dein Konto ({email}) geändert wurde.' },
  { templateType: 'password-changed', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück und kontaktiere den Support.' },
  // username-changed
  { templateType: 'username-changed', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'username-changed', key: 'body', value: 'Dein Benutzername wurde von <strong>{from}</strong> zu <strong>{to}</strong> geändert.' },
  { templateType: 'username-changed', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, kontaktiere bitte sofort den Support.' },
  // delete-account-confirmation
  { templateType: 'delete-account-confirmation', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'delete-account-confirmation', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Konto zu löschen. Klicke auf den Button unten, um zu bestätigen. Diese Aktion kann nicht rückgängig gemacht werden.' },
  { templateType: 'delete-account-confirmation', key: 'button', value: 'Löschung bestätigen' },
  { templateType: 'delete-account-confirmation', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'delete-account-confirmation', key: 'footer', value: 'Wenn du keine Kontolöschung angefordert hast, kannst du diese E-Mail ignorieren.' },
  // project-invitation
  { templateType: 'project-invitation', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'project-invitation', key: 'body', value: '{inviter} hat dich eingeladen, dem Projekt <strong>{project}</strong> als <strong>{role}</strong> beizutreten.' },
  { templateType: 'project-invitation', key: 'button', value: 'Einladung ansehen' },
  { templateType: 'project-invitation', key: 'invitation_id', value: 'Einladungs-ID: {id}' },
  // resource-health-changed
  { templateType: 'resource-health-changed', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'resource-health-changed', key: 'body_degraded', value: 'Ressource <strong>{resource}</strong> ist ausgefallen.' },
  { templateType: 'resource-health-changed', key: 'body_recovered', value: 'Ressource <strong>{resource}</strong> ist wieder gesund.' },
  { templateType: 'resource-health-changed', key: 'subsystem_label', value: 'Subsystem: <strong>{subsystem}</strong>' },
  { templateType: 'resource-health-changed', key: 'previous_status', value: 'Vorheriger Status: <strong>{status}</strong>' },
  { templateType: 'resource-health-changed', key: 'new_status', value: 'Neuer Status: <strong>{status}</strong>' },
  { templateType: 'resource-health-changed', key: 'reason_label', value: 'Grund: {reason}' },
  { templateType: 'resource-health-changed', key: 'button', value: 'Ressource öffnen' },
  { templateType: 'resource-health-changed', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'resource-health-changed', key: 'footer', value: 'Du erhältst diese E-Mail, weil du diese Ressource verwalten kannst.' },
  // user-retraining-required
  { templateType: 'user-retraining-required', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'user-retraining-required', key: 'body', value: 'Deine Einweisung für <strong>{resource}</strong> muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'reason_age', value: 'Deine Einweisung hat ihr maximales Alter erreicht und muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'reason_inactivity', value: 'Du hast diese Ressource längere Zeit nicht genutzt und musst neu eingewiesen werden.' },
  { templateType: 'user-retraining-required', key: 'reason_default', value: 'Deine Einweisung muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'blocks_access', value: 'Der Zugang zu dieser Ressource ist gesperrt, bis du von einem Einweiser neu eingewiesen wurdest.' },
  { templateType: 'user-retraining-required', key: 'button', value: 'Ressource öffnen' },
  { templateType: 'user-retraining-required', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'user-retraining-required', key: 'footer', value: 'Du erhältst diese E-Mail, weil deine Einweisung für diese Ressource erneuert werden muss.' },
  // maintenance-request-created
  { templateType: 'maintenance-request-created', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'maintenance-request-created', key: 'body', value: '<strong>{reporter}</strong> hat gemeldet, dass <strong>{resource}</strong> möglicherweise gewartet werden muss.' },
  { templateType: 'maintenance-request-created', key: 'reason_label', value: 'Grund: {reason}' },
  { templateType: 'maintenance-request-created', key: 'button', value: 'Anfrage prüfen' },
  { templateType: 'maintenance-request-created', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'maintenance-request-created', key: 'footer', value: 'Du erhältst diese E-Mail, weil du die Wartung für diese Ressource verwalten kannst.' },
  // resource-usage-note-added
  { templateType: 'resource-usage-note-added', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'resource-usage-note-added', key: 'body_start', value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Starten von <strong>{resource}</strong>.' },
  { templateType: 'resource-usage-note-added', key: 'body_end', value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Beenden von <strong>{resource}</strong>.' },
  { templateType: 'resource-usage-note-added', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-usage-note-added', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'resource-usage-note-added', key: 'footer', value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator dieser Ressource bist.' },
  // resource-usage-billing-transaction-summary
  { templateType: 'resource-usage-billing-transaction-summary', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'body', value: 'Deine Sitzung auf <strong>{resource}</strong> ist beendet. Hier ist dein Beleg:' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'start_label', value: 'Start: {time}' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'end_label', value: 'Ende: {time}' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'duration_label', value: 'Dauer: {minutes} min' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_item', value: 'Posten' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_qty', value: 'Anz.' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_unit', value: 'Einheit' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_total', value: 'Gesamt' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'total_credits', value: 'Gesamtkosten' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'new_balance', value: 'Neues Guthaben' },
  // message-received
  { templateType: 'message-received', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'message-received', key: 'body', value: '<strong>{sender}</strong> hat dir eine Nachricht geschickt, während du offline warst:' },
  { templateType: 'message-received', key: 'button', value: 'Gespräch öffnen' },
  { templateType: 'message-received', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'message-received', key: 'footer', value: 'Du erhältst diese E-Mail, weil du offline warst, als diese Nachricht ankam.' },
  // access-change
  { templateType: 'access-change', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'access-change', key: 'button', value: 'Details ansehen' },
  { templateType: 'access-change', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'access-change', key: 'footer', value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über Zugriffsänderungen für dein Konto aktiviert sind.' },
  // resource-takeover
  { templateType: 'resource-takeover', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'resource-takeover', key: 'body', value: '<strong>{actor}</strong> hat deine aktive Sitzung übernommen auf <strong>{resource}</strong>.' },
  { templateType: 'resource-takeover', key: 'unexpected_note', value: 'Wenn dies unerwartet war, prüfe bitte die Ressourcennutzungsseite oder kontaktiere einen Betreuer.' },
  { templateType: 'resource-takeover', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-takeover', key: 'copy_link', value: COPY_LINK_DE },
  // resource-session-ended
  { templateType: 'resource-session-ended', key: 'greeting', value: 'Hallo {name},' },
  { templateType: 'resource-session-ended', key: 'body', value: '<strong>{actor}</strong> hat deine aktive Sitzung beendet auf <strong>{resource}</strong>.' },
  { templateType: 'resource-session-ended', key: 'ended_at', value: 'Beendet am: {time}' },
  { templateType: 'resource-session-ended', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-session-ended', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: 'resource-session-ended', key: 'footer', value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über beendete Ressourcensitzungen in deinen Einstellungen aktiviert sind.' },
];

export class SeedDeEmailTemplates1782600000000 implements MigrationInterface {
  name = 'SeedDeEmailTemplates1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const row of DE) {
      await queryRunner.query(
        `INSERT OR IGNORE INTO "email_template_translations" ("templateType", "key", "locale", "value") VALUES (?, ?, ?, ?)`,
        [row.templateType, row.key, 'de', row.value],
      );
    }

    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2, "subject" = $3 WHERE "type" = 'resource-health-changed'`,
      [
        RESOURCE_HEALTH_CHANGED_MJML,
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,health.status,health.previousStatus,health.reason,health.identifier,health.isDegraded,health.headerColor',
        'Resource health update: {{resource.name}}',
      ],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'user-retraining-required'`,
      [
        USER_RETRAINING_REQUIRED_MJML,
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,retraining.isAge,retraining.isInactivity,retraining.blocksAccess',
      ],
    );
    await queryRunner.query(
      `UPDATE "email_templates" SET "body" = $1, "variables" = $2 WHERE "type" = 'resource-usage-note-added'`,
      [
        RESOURCE_USAGE_NOTE_ADDED_MJML,
        'user.username,user.email,user.id,host.frontend,host.backend,resource.id,resource.name,resource.url,note.authorName,note.content,note.isStart',
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const row of DE) {
      await queryRunner.query(
        `DELETE FROM "email_template_translations" WHERE "templateType" = ? AND "key" = ? AND "locale" = 'de'`,
        [row.templateType, row.key],
      );
    }
  }
}
