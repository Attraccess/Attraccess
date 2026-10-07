import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
