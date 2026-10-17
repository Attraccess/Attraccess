import type { EmailTemplate, EmailTemplateType, EmailTemplateTranslation } from '@attraccess/application-models';
import { operationToken } from '../../database/transaction-scope';
export type TemplateChanges = Partial<Pick<EmailTemplate, 'body' | 'subject' | 'variables'>>;
export type TemplateTranslation = Pick<EmailTemplateTranslation, 'templateType' | 'locale' | 'key' | 'value'>;
export interface EmailTemplateReader {
  template(type: EmailTemplateType): Promise<EmailTemplate | null>;
}
export const EMAIL_TEMPLATE_READ = operationToken<EmailTemplateReader>('email-template-read', ['template']);
export abstract class EmailTemplatePersistence implements EmailTemplateReader {
  abstract template(type: EmailTemplateType): Promise<EmailTemplate | null>;
  abstract templates(): Promise<EmailTemplate[]>;
  abstract update(type: EmailTemplateType, changes: TemplateChanges): Promise<void>;
  abstract translations(type: EmailTemplateType, locale?: string): Promise<EmailTemplateTranslation[]>;
  /** Replace one locale, or every locale when omitted, in one commit. */
  abstract replaceTranslations(
    type: EmailTemplateType,
    rows: readonly TemplateTranslation[],
    locale?: string,
  ): Promise<void>;
  abstract removeTranslations(type: EmailTemplateType, locale: string): Promise<void>;
}
