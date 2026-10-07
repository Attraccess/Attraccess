import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
export const resourceUsageNoteAddedTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'body_start',
    value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Starten von <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'body_end',
    value: '<strong>{author}</strong> hat eine Notiz hinterlassen beim Beenden von <strong>{resource}</strong>.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'button',
    value: 'Ressource ansehen',
  },
  { templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil du Einweiser, Betreuer oder Administrator dieser Ressource bist.',
  },
  {
    templateType: EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED,
    locale: 'de',
    key: 'subject',
    value: 'Neue Nutzungsnotiz: {resource}',
  },
];
