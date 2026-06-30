import { MigrationInterface, QueryRunner } from 'typeorm';

type Translation = { templateType: string; key: string; value: string };

const DE: Translation[] = [
  // verify-email
  { templateType: 'verify-email', key: 'greeting', value: 'Hallo' },
  { templateType: 'verify-email', key: 'body', value: 'Bitte bestätige deine E-Mail-Adresse, um dein Attraccess-Konto zu aktivieren.' },
  { templateType: 'verify-email', key: 'button', value: 'E-Mail bestätigen' },
  { templateType: 'verify-email', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'verify-email', key: 'footer', value: 'Wenn du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.' },
  // reset-password
  { templateType: 'reset-password', key: 'greeting', value: 'Hallo' },
  { templateType: 'reset-password', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um fortzufahren.' },
  { templateType: 'reset-password', key: 'button', value: 'Passwort zurücksetzen' },
  { templateType: 'reset-password', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'reset-password', key: 'footer', value: 'Wenn du kein Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren.' },
  // user-invitation
  { templateType: 'user-invitation', key: 'greeting', value: 'Hallo' },
  { templateType: 'user-invitation', key: 'body', value: 'Du wurdest eingeladen, Attraccess beizutreten. Nimm deine Einladung an, um loszulegen.' },
  { templateType: 'user-invitation', key: 'button', value: 'Einladung annehmen' },
  { templateType: 'user-invitation', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  // password-changed
  { templateType: 'password-changed', key: 'greeting', value: 'Hallo' },
  { templateType: 'password-changed', key: 'body_prefix', value: 'Dies ist eine Bestätigung, dass das Passwort für dein Konto' },
  { templateType: 'password-changed', key: 'body_suffix', value: 'geändert wurde.' },
  { templateType: 'password-changed', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück und kontaktiere den Support.' },
  // username-changed
  { templateType: 'username-changed', key: 'greeting', value: 'Hallo' },
  { templateType: 'username-changed', key: 'body_prefix', value: 'Dein Benutzername wurde von' },
  { templateType: 'username-changed', key: 'body_to', value: 'zu' },
  { templateType: 'username-changed', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, kontaktiere bitte sofort den Support.' },
  // delete-account-confirmation
  { templateType: 'delete-account-confirmation', key: 'greeting', value: 'Hallo' },
  { templateType: 'delete-account-confirmation', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Konto zu löschen. Klicke auf den Button unten, um zu bestätigen. Diese Aktion kann nicht rückgängig gemacht werden.' },
  { templateType: 'delete-account-confirmation', key: 'button', value: 'Löschung bestätigen' },
  { templateType: 'delete-account-confirmation', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'delete-account-confirmation', key: 'footer', value: 'Wenn du keine Kontolöschung angefordert hast, kannst du diese E-Mail ignorieren.' },
  // project-invitation
  { templateType: 'project-invitation', key: 'greeting', value: 'Hallo' },
  { templateType: 'project-invitation', key: 'body_invited', value: 'hat dich eingeladen, dem Projekt beizutreten' },
  { templateType: 'project-invitation', key: 'body_as', value: 'als' },
  { templateType: 'project-invitation', key: 'button', value: 'Einladung ansehen' },
  { templateType: 'project-invitation', key: 'invitation_id', value: 'Einladungs-ID:' },
  // resource-health-changed
  { templateType: 'resource-health-changed', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-health-changed', key: 'body_resource_prefix', value: 'Ressource' },
  { templateType: 'resource-health-changed', key: 'subsystem_label', value: 'Subsystem:' },
  { templateType: 'resource-health-changed', key: 'previous_status', value: 'Vorheriger Status:' },
  { templateType: 'resource-health-changed', key: 'new_status', value: 'Neuer Status:' },
  { templateType: 'resource-health-changed', key: 'reason_label', value: 'Grund:' },
  { templateType: 'resource-health-changed', key: 'button', value: 'Ressource öffnen' },
  { templateType: 'resource-health-changed', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'resource-health-changed', key: 'footer', value: 'Du erhältst diese E-Mail, weil du diese Ressource verwalten kannst.' },
  // user-retraining-required
  { templateType: 'user-retraining-required', key: 'greeting', value: 'Hallo' },
  { templateType: 'user-retraining-required', key: 'body_prefix', value: 'Deine Einweisung für' },
  { templateType: 'user-retraining-required', key: 'body_suffix', value: 'muss erneuert werden.' },
  { templateType: 'user-retraining-required', key: 'reason_label', value: 'Grund:' },
  { templateType: 'user-retraining-required', key: 'blocks_access', value: 'Der Zugang zu dieser Ressource ist gesperrt, bis du von einem Einweiser neu eingewiesen wurdest.' },
  { templateType: 'user-retraining-required', key: 'button', value: 'Ressource öffnen' },
  { templateType: 'user-retraining-required', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'user-retraining-required', key: 'footer', value: 'Du erhältst diese E-Mail, weil deine Einweisung für diese Ressource erneuert werden muss.' },
  // maintenance-request-created
  { templateType: 'maintenance-request-created', key: 'greeting', value: 'Hallo' },
  { templateType: 'maintenance-request-created', key: 'body_reported', value: 'hat gemeldet, dass' },
  { templateType: 'maintenance-request-created', key: 'body_may_need', value: 'möglicherweise gewartet werden muss.' },
  { templateType: 'maintenance-request-created', key: 'reason_label', value: 'Grund:' },
  { templateType: 'maintenance-request-created', key: 'button', value: 'Anfrage prüfen' },
  { templateType: 'maintenance-request-created', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'maintenance-request-created', key: 'footer', value: 'Du erhältst diese E-Mail, weil du die Wartung für diese Ressource verwalten kannst.' },
  // resource-usage-note-added
  { templateType: 'resource-usage-note-added', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-usage-note-added', key: 'body_left_note', value: 'hat eine Notiz hinterlassen beim' },
  { templateType: 'resource-usage-note-added', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-usage-note-added', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'resource-usage-note-added', key: 'footer', value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator dieser Ressource bist.' },
  // resource-usage-billing-transaction-summary
  { templateType: 'resource-usage-billing-transaction-summary', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'body_prefix', value: 'Deine Sitzung auf' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'body_suffix', value: 'ist beendet. Hier ist dein Beleg:' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'start_label', value: 'Start:' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'end_label', value: 'Ende:' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'duration_label', value: 'Dauer:' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_item', value: 'Posten' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_qty', value: 'Anz.' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_unit', value: 'Einheit' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'col_total', value: 'Gesamt' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'total_credits', value: 'Gesamtkosten' },
  { templateType: 'resource-usage-billing-transaction-summary', key: 'new_balance', value: 'Neues Guthaben' },
  // message-received
  { templateType: 'message-received', key: 'greeting', value: 'Hallo' },
  { templateType: 'message-received', key: 'body', value: 'hat dir eine Nachricht geschickt, während du offline warst:' },
  { templateType: 'message-received', key: 'button', value: 'Gespräch öffnen' },
  { templateType: 'message-received', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'message-received', key: 'footer', value: 'Du erhältst diese E-Mail, weil du offline warst, als diese Nachricht ankam.' },
  // access-change
  { templateType: 'access-change', key: 'greeting', value: 'Hallo' },
  { templateType: 'access-change', key: 'button', value: 'Details ansehen' },
  { templateType: 'access-change', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  { templateType: 'access-change', key: 'footer', value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über Zugriffsänderungen für dein Konto aktiviert sind.' },
  // resource-takeover
  { templateType: 'resource-takeover', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-takeover', key: 'body_took_over', value: 'hat deine aktive Sitzung übernommen auf' },
  { templateType: 'resource-takeover', key: 'unexpected_note', value: 'Wenn dies unerwartet war, prüfe bitte die Ressourcennutzungsseite oder kontaktiere einen Betreuer.' },
  { templateType: 'resource-takeover', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-takeover', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
  // resource-session-ended
  { templateType: 'resource-session-ended', key: 'greeting', value: 'Hallo' },
  { templateType: 'resource-session-ended', key: 'body_ended', value: 'hat deine aktive Sitzung beendet auf' },
  { templateType: 'resource-session-ended', key: 'ended_at', value: 'Beendet am:' },
  { templateType: 'resource-session-ended', key: 'button', value: 'Ressource ansehen' },
  { templateType: 'resource-session-ended', key: 'copy_link', value: 'Oder kopiere diesen Link in deinen Browser:' },
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "email_template_translations" WHERE "locale" = 'de'`);
  }
}
