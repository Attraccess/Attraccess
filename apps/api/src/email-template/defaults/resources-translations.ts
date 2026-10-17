import { EmailTemplateType } from '@attraccess/database-entities';
import type { ShippedTranslation } from '../email-defaults';

const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';

export const resourceUsageNoteAddedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'body_start',
    value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Starten von <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'body_end',
    value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Beenden von <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'button',
    value: 'Ressource ansehen',
  },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator dieser Ressource bist.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'subject',
    value: 'Neue Nutzungsnotiz: {resource}',
  },
];

export const resourceSessionEndedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'body',
    value: '<strong>{actor}</strong> hat deine aktive Sitzung beendet auf <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'ended_at',
    value: 'Beendet am: {time}',
  },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'footer',
    value:
      'Du erhältst diese E-Mail, weil Benachrichtigungen über beendete Ressourcensitzungen in deinen Einstellungen aktiviert sind.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'subject',
    value: 'Sitzung auf {resource} beendet',
  },
];

export const maintenanceRequestCreatedTranslations: ShippedTranslation[] = [
  {
    templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED,
    locale: 'de',
    key: 'greeting',
    value: 'Hallo {name},',
  },
  {
    templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED,
    locale: 'de',
    key: 'body',
    value:
      '<strong>{reporter}</strong> hat gemeldet, dass <strong>{resource}</strong> möglicherweise gewartet werden muss.',
  },
  {
    templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED,
    locale: 'de',
    key: 'reason_label',
    value: 'Grund: {reason}',
  },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'button', value: 'Anfrage prüfen' },
  { templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil du die Wartung für diese Ressource verwalten kannst.',
  },
  {
    templateType: EmailTemplateType.MAINTENANCE_REQUEST_CREATED,
    locale: 'de',
    key: 'subject',
    value: 'Wartung angefordert: {resource}',
  },
];

export const resourceUsageBillingTransactionSummaryTranslations: ShippedTranslation[] = [
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'greeting',
    value: 'Hallo {name},',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'body',
    value: 'Deine Sitzung auf <strong>{resource}</strong> ist beendet. Hier ist dein Beleg:',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'start_label',
    value: 'Start: {time}',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'end_label',
    value: 'Ende: {time}',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'duration_label',
    value: 'Dauer: {minutes} min',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'col_item',
    value: 'Posten',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'col_qty',
    value: 'Anz.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'col_unit',
    value: 'Einheit',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'col_total',
    value: 'Gesamt',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'total_credits',
    value: 'Gesamtkosten',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'new_balance',
    value: 'Neues Guthaben',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'subject',
    value: 'Dein Nutzungsbeleg für {resource}',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'billing_factor_applied',
    value: 'Angewendeter Abrechnungsfaktor: {factor}',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'item_session_duration',
    value: 'Sitzungszeit',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'item_operating_duration',
    value: 'Zugeordnete Betriebszeit',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'item_fixed_fee',
    value: 'Feste Sitzungsgebühr',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'item_billing_factor',
    value: 'Anpassung durch Abrechnungsfaktor',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'meter_unavailable',
    value: 'Endwert nicht verfügbar; keine Zählergebühr enthalten.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'duration_measured',
    value: 'Gemessen: {seconds} s',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'duration_billed',
    value: 'Abgerechnet: {minutes} min',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'duration_rate',
    value: '{credits} Credits/min',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'col_rate',
    value: 'Preis',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY,
    locale: 'de',
    key: 'quantity_unavailable',
    value: 'Nicht verfügbar',
  },
];

export const userRetrainingRequiredTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'body',
    value: 'Deine Einweisung für <strong>{resource}</strong> muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_age',
    value: 'Deine Einweisung hat ihr maximales Alter erreicht und muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_inactivity',
    value: 'Du hast diese Ressource längere Zeit nicht genutzt und musst neu eingewiesen werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_default',
    value: 'Deine Einweisung muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'blocks_access',
    value: 'Der Zugang zu dieser Ressource ist gesperrt, bis du von einem Einweiser neu eingewiesen wurdest.',
  },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'button', value: 'Ressource öffnen' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil deine Einweisung für diese Ressource erneuert werden muss.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'subject',
    value: 'Einweisung erforderlich: {resource}',
  },
];

export const resourceTakeoverTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'body',
    value: '<strong>{actor}</strong> hat deine aktive Sitzung übernommen auf <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'unexpected_note',
    value: 'Wenn dies unerwartet war, prüfe bitte die Ressourcennutzungsseite oder kontaktiere einen Betreuer.',
  },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'subject',
    value: '{resource} wurde übernommen',
  },
];

export const resourceHealthChangedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'body_degraded',
    value: 'Ressource <strong>{resource}</strong> ist ausgefallen.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'body_recovered',
    value: 'Ressource <strong>{resource}</strong> ist wieder gesund.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'subsystem_label',
    value: 'Subsystem: <strong>{subsystem}</strong>',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'previous_status',
    value: 'Vorheriger Status: <strong>{status}</strong>',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'new_status',
    value: 'Neuer Status: <strong>{status}</strong>',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'reason_label',
    value: 'Grund: {reason}',
  },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'button', value: 'Ressource öffnen' },
  { templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil du diese Ressource verwalten kannst.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'subject_degraded',
    value: 'Ressource ausgefallen: {resource}',
  },
  {
    templateType: EmailTemplateType.RESOURCE_HEALTH_CHANGED,
    locale: 'de',
    key: 'subject_recovered',
    value: 'Ressource wiederhergestellt: {resource}',
  },
];

export const messageReceivedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.MESSAGE_RECEIVED,
    locale: 'de',
    key: 'body',
    value: '<strong>{sender}</strong> hat dir eine Nachricht geschickt, während du offline warst:',
  },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'button', value: 'Gespräch öffnen' },
  { templateType: EmailTemplateType.MESSAGE_RECEIVED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.MESSAGE_RECEIVED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil du offline warst, als diese Nachricht ankam.',
  },
  {
    templateType: EmailTemplateType.MESSAGE_RECEIVED,
    locale: 'de',
    key: 'subject',
    value: 'Neue Nachricht von {sender}',
  },
];
