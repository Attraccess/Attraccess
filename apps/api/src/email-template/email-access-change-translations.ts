import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
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
