import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
export const resourceSessionEndedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'body',
    value: '<strong>{actor}</strong> hat deine aktive Sitzung beendet auf <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'ended_at',
    value: 'Beendet am: {time}',
  },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'button', value: 'Ressource ansehen' },
  { templateType: EmailTemplateType.RESOURCE_SESSION_ENDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'footer',
    value:
      'Du erhältst diese E-Mail, weil Benachrichtigungen über beendete Ressourcensitzungen in deinen Einstellungen aktiviert sind.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_SESSION_ENDED,
    locale: 'de',
    key: 'subject',
    value: 'Sitzung auf {resource} beendet',
  },
];
