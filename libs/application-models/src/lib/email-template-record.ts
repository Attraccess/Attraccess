import type { EmailTemplateType } from './email-template';

/** A stored email template. The type is a core template type or the namespaced key of a plugin template. */
export interface EmailTemplateRecord {
  type: EmailTemplateType;
  subject: string;
  body: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** One translated text of a template for one locale. */
export interface EmailTemplateTranslationRecord {
  templateType: EmailTemplateType;
  key: string;
  locale: string;
  value: string;
}
