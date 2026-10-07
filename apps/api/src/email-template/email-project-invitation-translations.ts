import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
export const projectInvitationTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'body',
    value:
      '{inviter} hat dich eingeladen, dem Projekt <strong>{project}</strong> als <strong>{role}</strong> beizutreten.',
  },
  { templateType: EmailTemplateType.PROJECT_INVITATION, locale: 'de', key: 'button', value: 'Einladung ansehen' },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'invitation_id',
    value: 'Einladungs-ID: {id}',
  },
  {
    templateType: EmailTemplateType.PROJECT_INVITATION,
    locale: 'de',
    key: 'subject',
    value: 'Du wurdest zu {project} eingeladen',
  },
];
