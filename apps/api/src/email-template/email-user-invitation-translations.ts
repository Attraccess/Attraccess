import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
export const userInvitationTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.USER_INVITATION,
    locale: 'de',
    key: 'body',
    value: 'Du wurdest eingeladen, Attraccess beizutreten. Nimm deine Einladung an, um loszulegen.',
  },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'button', value: 'Einladung annehmen' },
  { templateType: EmailTemplateType.USER_INVITATION, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.USER_INVITATION,
    locale: 'de',
    key: 'subject',
    value: 'Du wurdest zu Attraccess eingeladen!',
  },
];
