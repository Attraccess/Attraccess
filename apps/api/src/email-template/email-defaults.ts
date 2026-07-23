import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { EmailTemplateType } from '@attraccess/database-entities';

export interface EmailTemplateDefault {
  subject: string;
  variables: string[];
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateType, EmailTemplateDefault> = {
  [EmailTemplateType.VERIFY_EMAIL]: {
    subject: '{{t "subject" "Verify your email address"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.RESET_PASSWORD]: {
    subject: '{{t "subject" "Reset your password"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.USER_INVITATION]: {
    subject: '{{t "subject" "You have been invited to join Attraccess!"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.USERNAME_CHANGED]: {
    subject: '{{t "subject" "Your username has been changed"}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'user.previousUsername',
      'user.newUsername',
      'host.frontend',
      'host.backend',
      'url',
    ],
  },
  [EmailTemplateType.PASSWORD_CHANGED]: {
    subject: '{{t "subject" "Your password has been changed"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend'],
  },
  [EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION]: {
    subject: '{{t "subject" "Confirm account deletion"}}',
    variables: ['user.username', 'user.email', 'user.id', 'host.frontend', 'host.backend', 'url'],
  },
  [EmailTemplateType.PROJECT_INVITATION]: {
    subject: '{{t "subject" "You have been invited to {project}" project=project.name}}',
    variables: [
      'user.username',
      'project.name',
      'inviter.username',
      'invitation.id',
      'invitation.role',
      'invitationUrl',
      'host.frontend',
    ],
  },
  [EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY]: {
    subject: '{{t "subject" "Your usage receipt for {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'host.frontend',
      'host.backend',
      'usage.startTime',
      'usage.endTime',
      'usage.roundedMinutes',
      'items[].name',
      'items[].quantity',
      'items[].unitPrice',
      'items[].total',
      'totalCredits',
      'newBalance',
    ],
  },
  [EmailTemplateType.RESOURCE_HEALTH_CHANGED]: {
    subject:
      '{{#if health.isDegraded}}{{t "subject_degraded" "Resource degraded: {resource}" resource=resource.name}}{{else}}{{t "subject_recovered" "Resource recovered: {resource}" resource=resource.name}}{{/if}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'health.status',
      'health.previousStatus',
      'health.reason',
      'health.identifier',
      'health.isDegraded',
      'health.headerColor',
    ],
  },
  [EmailTemplateType.USER_RETRAINING_REQUIRED]: {
    subject: '{{t "subject" "Retraining required: {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'retraining.isAge',
      'retraining.isInactivity',
      'retraining.blocksAccess',
    ],
  },
  [EmailTemplateType.MESSAGE_RECEIVED]: {
    subject: '{{t "subject" "New message from {sender}" sender=message.senderName}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'message.senderName',
      'message.preview',
      'message.conversationUrl',
    ],
  },
  [EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED]: {
    subject: '{{t "subject" "New usage note: {resource}" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'note.authorName',
      'note.content',
      'note.isStart',
    ],
  },
  [EmailTemplateType.RESOURCE_TAKEOVER]: {
    subject: '{{t "subject" "{resource} was taken over" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'takeover.actorName',
    ],
  },
  [EmailTemplateType.RESOURCE_SESSION_ENDED]: {
    subject: '{{t "subject" "{resource} session ended" resource=resource.name}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'resource.id',
      'resource.name',
      'resource.url',
      'session.id',
      'session.endedAt',
      'session.endedBy',
    ],
  },
  [EmailTemplateType.ACCESS_CHANGE]: {
    subject: '{{accessChange.title}}',
    variables: [
      'user.username',
      'user.email',
      'user.id',
      'host.frontend',
      'host.backend',
      'accessChange.title',
      'accessChange.body',
      'accessChange.url',
    ],
  },
  [EmailTemplateType.MAINTENANCE_REQUEST_CREATED]: {
    subject: '{{t "subject" "Maintenance requested: {resource}" resource=resource.name}}',
    variables: [
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
    ],
  },
};

export interface ShippedTranslation {
  templateType: EmailTemplateType;
  locale: string;
  key: string;
  value: string;
}

const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';

// ponytail: seed migration 1782600000000 references this constant — adding rows here only affects fresh installs.
// Existing installs receive new rows only when an admin resets a template, or via a new migration.
export const SHIPPED_TRANSLATIONS: ShippedTranslation[] = [
  // verify-email
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'body', value: 'Bitte bestätige deine E-Mail-Adresse, um dein Attraccess-Konto zu aktivieren.' },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'button', value: 'E-Mail bestätigen' },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'footer', value: 'Wenn du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.' },
  // reset-password
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um fortzufahren.' },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'button', value: 'Passwort zurücksetzen' },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'footer', value: 'Wenn du kein Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren.' },
  // user-invitation
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'body', value: 'Du wurdest eingeladen, Attraccess beizutreten. Nimm deine Einladung an, um loszulegen.' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'button', value: 'Einladung annehmen' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  // password-changed
  { templateType: EmailTemplateType.PASSWORD_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.PASSWORD_CHANGED, locale: 'de', key: 'body', value: 'Dies ist eine Bestätigung, dass das Passwort für dein Konto ({email}) geändert wurde.' },
  { templateType: EmailTemplateType.PASSWORD_CHANGED, locale: 'de', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück und kontaktiere den Support.' },
  // username-changed
  { templateType: EmailTemplateType.USERNAME_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.USERNAME_CHANGED, locale: 'de', key: 'body', value: 'Dein Benutzername wurde von <strong>{from}</strong> zu <strong>{to}</strong> geändert.' },
  { templateType: EmailTemplateType.USERNAME_CHANGED, locale: 'de', key: 'footer', value: 'Wenn du diese Änderung nicht vorgenommen hast, kontaktiere bitte sofort den Support.' },
  // delete-account-confirmation
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'body', value: 'Wir haben eine Anfrage erhalten, dein Konto zu löschen. Klicke auf den Button unten, um zu bestätigen. Diese Aktion kann nicht rückgängig gemacht werden.' },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'button', value: 'Löschung bestätigen' },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'footer', value: 'Wenn du keine Kontolöschung angefordert hast, kannst du diese E-Mail ignorieren.' },
  // project-invitation
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'body', value: '{inviter} hat dich eingeladen, dem Projekt <strong>{project}</strong> als <strong>{role}</strong> beizutreten.' },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'button', value: 'Einladung ansehen' },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'invitation_id', value: 'Einladungs-ID: {id}' },
  // resource-health-changed
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'body_degraded', value: 'Ressource <strong>{resource}</strong> ist ausgefallen.' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'body_recovered', value: 'Ressource <strong>{resource}</strong> ist wieder gesund.' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'subsystem_label', value: 'Subsystem: <strong>{subsystem}</strong>' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'previous_status', value: 'Vorheriger Status: <strong>{status}</strong>' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'new_status', value: 'Neuer Status: <strong>{status}</strong>' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'reason_label', value: 'Grund: {reason}' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'button', value: 'Ressource öffnen' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil du diese Ressource verwalten kannst.' },
  // user-retraining-required
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'body', value: 'Deine Einweisung für <strong>{resource}</strong> muss erneuert werden.' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'reason_age', value: 'Deine Einweisung hat ihr maximales Alter erreicht und muss erneuert werden.' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'reason_inactivity', value: 'Du hast diese Ressource längere Zeit nicht genutzt und musst neu eingewiesen werden.' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'reason_default', value: 'Deine Einweisung muss erneuert werden.' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'blocks_access', value: 'Der Zugang zu dieser Ressource ist gesperrt, bis du von einem Einweiser neu eingewiesen wurdest.' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'button', value: 'Ressource öffnen' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil deine Einweisung für diese Ressource erneuert werden muss.' },
  // maintenance-request-created
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'body', value: '<strong>{reporter}</strong> hat gemeldet, dass <strong>{resource}</strong> möglicherweise gewartet werden muss.' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'reason_label', value: 'Grund: {reason}' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'button', value: 'Anfrage prüfen' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil du die Wartung für diese Ressource verwalten kannst.' },
  // resource-usage-note-added
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'body_start', value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Starten von <strong>{resource}</strong>.' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'body_end', value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Beenden von <strong>{resource}</strong>.' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator dieser Ressource bist.' },
  // resource-usage-billing-transaction-summary
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'body', value: 'Deine Sitzung auf <strong>{resource}</strong> ist beendet. Hier ist dein Beleg:' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'start_label', value: 'Start: {time}' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'end_label', value: 'Ende: {time}' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'duration_label', value: 'Dauer: {minutes} min' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'col_item', value: 'Posten' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'col_qty', value: 'Anz.' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'col_unit', value: 'Einheit' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'col_total', value: 'Gesamt' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'total_credits', value: 'Gesamtkosten' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'new_balance', value: 'Neues Guthaben' },
  // message-received
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'body', value: '<strong>{sender}</strong> hat dir eine Nachricht geschickt, während du offline warst:' },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'button', value: 'Gespräch öffnen' },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil du offline warst, als diese Nachricht ankam.' },
  // access-change
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'button', value: 'Details ansehen' },
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über Zugriffsänderungen für dein Konto aktiviert sind.' },
  // resource-takeover
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'body', value: '<strong>{actor}</strong> hat deine aktive Sitzung übernommen auf <strong>{resource}</strong>.' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'unexpected_note', value: 'Wenn dies unerwartet war, prüfe bitte die Ressourcennutzungsseite oder kontaktiere einen Betreuer.' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  // resource-session-ended
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'body', value: '<strong>{actor}</strong> hat deine aktive Sitzung beendet auf <strong>{resource}</strong>.' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'ended_at', value: 'Beendet am: {time}' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'footer', value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über beendete Ressourcensitzungen in deinen Einstellungen aktiviert sind.' },
  // subjects (English defaults are baked into the {{t "subject" …}} calls above; ACCESS_CHANGE has no static subject to translate)
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'subject', value: 'Bestätige deine E-Mail-Adresse' },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'subject', value: 'Setze dein Passwort zurück' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'subject', value: 'Du wurdest zu Attraccess eingeladen!' },
  { templateType: EmailTemplateType.USERNAME_CHANGED, locale: 'de', key: 'subject', value: 'Dein Benutzername wurde geändert' },
  { templateType: EmailTemplateType.PASSWORD_CHANGED, locale: 'de', key: 'subject', value: 'Dein Passwort wurde geändert' },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'subject', value: 'Kontolöschung bestätigen' },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'subject', value: 'Du wurdest zu {project} eingeladen' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, locale: 'de', key: 'subject', value: 'Dein Nutzungsbeleg für {resource}' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'subject_degraded', value: 'Ressource ausgefallen: {resource}' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'subject_recovered', value: 'Ressource wiederhergestellt: {resource}' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'subject', value: 'Einweisung erforderlich: {resource}' },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'subject', value: 'Neue Nachricht von {sender}' },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'subject', value: 'Neue Nutzungsnotiz: {resource}' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'subject', value: '{resource} wurde übernommen' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'subject', value: 'Sitzung auf {resource} beendet' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'subject', value: 'Wartung angefordert: {resource}' },
];

// In the webpack bundle __dirname is the dist root (assets copied next to main.js);
// under jest the source layout applies and assets live one level up from this module.
const ASSETS_DIR =
  [join(__dirname, 'assets', 'email-defaults'), join(__dirname, '..', 'assets', 'email-defaults')].find(existsSync) ??
  join(__dirname, 'assets', 'email-defaults');

export function readDefaultTemplateBody(type: EmailTemplateType): string {
  return readFileSync(join(ASSETS_DIR, 'templates', `${type}.mjml`), 'utf-8').trim();
}

export function readDefaultLayoutBody(): string {
  return readFileSync(join(ASSETS_DIR, 'layout.mjml'), 'utf-8').trim();
}
