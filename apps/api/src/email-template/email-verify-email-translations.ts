import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
