import { EmailTemplateType } from '@attraccess/database-entities';
import type { ShippedTranslation } from '../email-defaults';

const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';

export const accessChangeTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'button', value: 'Details ansehen' },
  { templateType: EmailTemplateType.ACCESS_CHANGE, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.ACCESS_CHANGE,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil Benachrichtigungen über Zugriffsänderungen für dein Konto aktiviert sind.',
  },
];

export const verifyEmailTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.VERIFY_EMAIL,
    locale: 'de',
    key: 'body',
    value: 'Bitte bestätige deine E-Mail-Adresse, um dein Attraccess-Konto zu aktivieren.',
  },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'button', value: 'E-Mail bestätigen' },
  { templateType: EmailTemplateType.VERIFY_EMAIL, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.VERIFY_EMAIL,
    locale: 'de',
    key: 'footer',
    value: 'Wenn du kein Konto erstellt hast, kannst du diese E-Mail ignorieren.',
  },
  {
    templateType: EmailTemplateType.VERIFY_EMAIL,
    locale: 'de',
    key: 'subject',
    value: 'Bestätige deine E-Mail-Adresse',
  },
];

export const deleteAccountConfirmationTranslations: ShippedTranslation[] = [
  {
    templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION,
    locale: 'de',
    key: 'greeting',
    value: 'Hallo {name},',
  },
  {
    templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION,
    locale: 'de',
    key: 'body',
    value:
      'Wir haben eine Anfrage erhalten, dein Konto zu löschen. Klicke auf den Button unten, um zu bestätigen. Diese Aktion kann nicht rückgängig gemacht werden.',
  },
  {
    templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION,
    locale: 'de',
    key: 'button',
    value: 'Löschung bestätigen',
  },
  { templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION,
    locale: 'de',
    key: 'footer',
    value: 'Wenn du keine Kontolöschung angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  {
    templateType: EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION,
    locale: 'de',
    key: 'subject',
    value: 'Kontolöschung bestätigen',
  },
];

export const passwordChangedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.PASSWORD_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.PASSWORD_CHANGED,
    locale: 'de',
    key: 'body',
    value: 'Dies ist eine Bestätigung, dass das Passwort für dein Konto ({email}) geändert wurde.',
  },
  {
    templateType: EmailTemplateType.PASSWORD_CHANGED,
    locale: 'de',
    key: 'footer',
    value:
      'Wenn du diese Änderung nicht vorgenommen hast, setze dein Passwort sofort zurück und kontaktiere den Support.',
  },
  {
    templateType: EmailTemplateType.PASSWORD_CHANGED,
    locale: 'de',
    key: 'subject',
    value: 'Dein Passwort wurde geändert',
  },
];

export const userInvitationTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.USER_INVITATION,
    locale: 'de',
    key: 'body',
    value: 'Du wurdest eingeladen, Attraccess beizutreten. Nimm deine Einladung an, um loszulegen.',
  },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'button', value: 'Einladung annehmen' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.USER_INVITATION,
    locale: 'de',
    key: 'subject',
    value: 'Du wurdest zu Attraccess eingeladen!',
  },
];

export const usernameChangedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.USERNAME_CHANGED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.USERNAME_CHANGED,
    locale: 'de',
    key: 'body',
    value: 'Dein Benutzername wurde von <strong>{from}</strong> zu <strong>{to}</strong> geändert.',
  },
  {
    templateType: EmailTemplateType.USERNAME_CHANGED,
    locale: 'de',
    key: 'footer',
    value: 'Wenn du diese Änderung nicht vorgenommen hast, kontaktiere bitte sofort den Support.',
  },
  {
    templateType: EmailTemplateType.USERNAME_CHANGED,
    locale: 'de',
    key: 'subject',
    value: 'Dein Benutzername wurde geändert',
  },
];

export const resetPasswordTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESET_PASSWORD,
    locale: 'de',
    key: 'body',
    value:
      'Wir haben eine Anfrage erhalten, dein Passwort zurückzusetzen. Klicke auf den Button unten, um fortzufahren.',
  },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'button', value: 'Passwort zurücksetzen' },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESET_PASSWORD,
    locale: 'de',
    key: 'footer',
    value: 'Wenn du kein Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  { templateType: EmailTemplateType.RESET_PASSWORD, locale: 'de', key: 'subject', value: 'Setze dein Passwort zurück' },
];

export const projectInvitationTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'body',
    value:
      '{inviter} hat dich eingeladen, dem Projekt <strong>{project}</strong> als <strong>{role}</strong> beizutreten.',
  },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'button', value: 'Einladung ansehen' },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'invitation_id',
    value: 'Einladungs-ID: {id}',
  },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'subject',
    value: 'Du wurdest zu {project} eingeladen',
  },
];
