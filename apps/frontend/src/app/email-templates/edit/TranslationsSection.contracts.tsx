import { EmailTemplateType } from '@attraccess/react-query-client';
export type LocaleValues = Record<string, string>;

export interface TranslationsSectionProps {
  templateType: EmailTemplateType;
  liveContent: string;
}
