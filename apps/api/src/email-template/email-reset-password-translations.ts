import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
