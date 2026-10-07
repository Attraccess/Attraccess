import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
