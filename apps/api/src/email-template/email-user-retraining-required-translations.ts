import { EmailTemplateType } from '@attraccess/database-entities';
import { ShippedTranslation } from './email-defaults';
const COPY_LINK_DE = 'Oder kopiere diesen Link in deinen Browser:<br /><a href="{url}">{url}</a>';
export const userRetrainingRequiredTranslations: ShippedTranslation[] = [
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'body',
    value: 'Deine Einweisung für <strong>{resource}</strong> muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_age',
    value: 'Deine Einweisung hat ihr maximales Alter erreicht und muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_inactivity',
    value: 'Du hast diese Ressource längere Zeit nicht genutzt und musst neu eingewiesen werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'reason_default',
    value: 'Deine Einweisung muss erneuert werden.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'blocks_access',
    value: 'Der Zugang zu dieser Ressource ist gesperrt, bis du von einem Einweiser neu eingewiesen wurdest.',
  },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'button', value: 'Ressource öffnen' },
  { templateType: EmailTemplateType.USER_RETRAINING_REQUIRED, locale: 'de', key: 'copy_link', value: COPY_LINK_DE },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'footer',
    value: 'Du erhältst diese E-Mail, weil deine Einweisung für diese Ressource erneuert werden muss.',
  },
  {
    templateType: EmailTemplateType.USER_RETRAINING_REQUIRED,
    locale: 'de',
    key: 'subject',
    value: 'Einweisung erforderlich: {resource}',
  },
];
