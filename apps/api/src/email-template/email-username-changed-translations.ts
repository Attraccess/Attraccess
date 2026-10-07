import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
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
