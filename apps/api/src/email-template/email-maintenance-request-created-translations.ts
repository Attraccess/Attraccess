import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
