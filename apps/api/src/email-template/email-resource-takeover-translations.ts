import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
export const resourceTakeoverTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'body',
    value: '<strong>{actor}</strong> hat deine aktive Sitzung übernommen auf <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'unexpected_note',
    value: 'Wenn dies unerwartet war, prüfe bitte die Ressourcennutzungsseite oder kontaktiere einen Betreuer.',
  },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_TAKEOVER, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_TAKEOVER,
    locale: 'de',
    key: 'subject',
    value: '{resource} wurde übernommen',
  },
];
