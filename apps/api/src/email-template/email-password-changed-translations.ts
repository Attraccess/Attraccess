import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
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
