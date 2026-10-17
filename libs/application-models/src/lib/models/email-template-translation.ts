import { EmailTemplateType } from './email-template';

export interface EmailTemplateTranslation {
  templateType: EmailTemplateType;
  key: string;
  locale: string;
  value: string;
}
