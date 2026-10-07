import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
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
